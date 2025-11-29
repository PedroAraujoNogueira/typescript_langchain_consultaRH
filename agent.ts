import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { StateGraph } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { MongoClient } from "mongodb";
import { array, z } from "zod";
import "dotenv/config";

export async function callAgent(client: MongoClient, query: string, thread_id: string) {
  // Define the MongoDB database and collection
  const dbName = "hr_database";
  const db = client.db(dbName);
  const collection = db.collection("employees");

  // Define the graph state
  // Essas linhas definem o estado do grafo no LangGraph. Explicação:
  // Definição do Estado do Grafo
  // agent.tsLines 23-29
  // Define the graph stateconst GraphState = Annotation.Root({  messages: Annotation<BaseMessage[]>({    reducer: (x, y) => x.concat(y),  }),});
  // Linha 24: Annotation.Root({...})
  // Cria um esquema de estado raiz usando Annotation.Root.
  // Define a estrutura de dados que o grafo mantém entre as execuções dos nós.
  // Linha 25: messages: Annotation<BaseMessage[]>({...})
  // Adiciona o campo messages ao estado, do tipo BaseMessage[] (array de mensagens).
  // Armazena o histórico de mensagens da conversa.
  // Linha 26: reducer: (x, y) => x.concat(y)
  // Define como atualizar messages quando múltiplos nós retornam valores.
  // Função de redução:
  // x: estado atual de mensagens
  // y: novas mensagens
  // .concat(y): concatena as novas mensagens ao array existente
  // Por que isso é importante?
  // No fluxo do grafo, diferentes nós podem adicionar mensagens:
  // O nó "agent" adiciona a resposta do modelo
  // O nó "tools" pode adicionar resultados de ferramentas
  // O reducer garante que todas as mensagens sejam acumuladas no histórico, permitindo manter o contexto da conversa ao longo da execução.
  // Exemplo prático:
  // Estado inicial: messages: [HumanMessage("Olá")]
  // Depois do agent: messages: [HumanMessage("Olá"), AIMessage("Oi! Como posso ajudar?")]
  // Depois de usar uma tool: messages: [...mensagens anteriores, ToolMessage("resultado")]
  const GraphState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
      reducer: (x, y) => x.concat(y),
    }),
  });

  // Define the tools for the agent to use
  const employeeLookupTool = tool(
    async ({ query, n = 10 }) => {
      console.log("Employee lookup tool called");

      const dbConfig = {
        collection: collection,
        indexName: "vector_index",
        textKey: "embedding_text",
        embeddingKey: "embedding_example",
      };

      // Initialize vector store
      const vectorStore = new MongoDBAtlasVectorSearch(
        new OpenAIEmbeddings(),
        dbConfig
      );

      const result = await vectorStore.similaritySearchWithScore(query, n);
      return JSON.stringify(result);
    },
    {
      name: "employee_lookup",
      description: "Gathers employee details from the HR database",
      schema: z.object({
        query: z.string().describe("The search query"),
        n: z
          .number()
          .optional()
          .default(10)
          .describe("Number of results to return"),
      }),
    }
  );

  const tools = [employeeLookupTool];
  
  // We can extract the state typing via `GraphState.State`
  const toolNode = new ToolNode<typeof GraphState.State>(tools);

  const model = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0,
  }).bindTools(tools);

  // Define the function that determines whether to continue or not
  function shouldContinue(state: typeof GraphState.State) {
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1] as AIMessage;

    // If the LLM makes a tool call, then we route to the "tools" node
    if (lastMessage.tool_calls?.length) {
      return "tools";
    }
    // Otherwise, we stop (reply to the user)
    return "__end__";
  }

  // Define the function that calls the model
  async function callModel(state: typeof GraphState.State) {
    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are a helpful AI assistant, collaborating with other assistants. Use the provided tools to progress towards answering the question. If you are unable to fully answer, that's OK, another assistant with different tools will help where you left off. Execute what you can to make progress. If you or any of the other assistants have the final answer or deliverable, prefix your response with FINAL ANSWER so the team knows to stop. You have access to the following tools: {tool_names}.\n{system_message}\nCurrent time: {time}.`,
      ],
      new MessagesPlaceholder("messages"),
    ]);

    const formattedPrompt = await prompt.formatMessages({
      system_message: "You are helpful HR Chatbot Agent.",
      time: new Date().toISOString(),
      tool_names: tools.map((tool) => tool.name).join(", "),
      messages: state.messages,
    });

    const result = await model.invoke(formattedPrompt);

    return { messages: [result] };
  }

  // Define a new graph
  const workflow = new StateGraph(GraphState)
    .addNode("agent", callModel)
    .addNode("tools", toolNode)
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", "agent");

  // Initialize the MongoDB memory to persist state between graph runs
  const checkpointer = new MongoDBSaver({ client, dbName });

  // This compiles it into a LangChain Runnable.
  // Note that we're passing the memory when compiling the graph
  const app = workflow.compile({ checkpointer });

  // Use the Runnable
  const finalState = await app.invoke(
    {
      messages: [new HumanMessage(query)],
    },
    { recursionLimit: 15, configurable: { thread_id: thread_id } }
  );

  // console.log(JSON.stringify(finalState.messages, null, 2));
  console.log(finalState.messages[finalState.messages.length - 1].content);

  return finalState.messages[finalState.messages.length - 1].content;
}
