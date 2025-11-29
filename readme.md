# API usando Langchain e Mongodb com base vetorial.  
### Como executar o projeto: 
-> Digite no terminal(na pasta raiz do projeto) o comando "npm install".
-> Adicione as variáveis de ambiente abaixo no arquivo .env: 
OPENAI_API_KEY=SUA_CHAVE
MONGODB_ATLAS_URI=SUA_STRING_DE_CONEXAO  
-> Digite "npm run dev" para iniciar a aplicação.  
-> Faça um teste fazendo uma chamada para o metodo Post na rota /chat, pode usar o curl abaixo
curl -X POST -H "Content-Type: application/json" -d '{"message": "Build a team to make an IOS app, and tell me the talent gaps"}' http://localhost:3000/chat/

### Descrição do projeto:  
O projeto é uma pequena aplicação de IA feita usando Langchain e mongodb, utilizando os serviços da OPENAI e o banco vetorial do mongo. Nesse projeto criamos um agente e uma ferramenta, essa ferramenta é responsável por fazer RAG em informações salvas no banco vetorial(Mongo). Após termos a ferramenta e o agente criamos o workflow, que controla o fluxo de trabalho, e que é responsável por chamar o agente e decidir se deve ou não chamar a ferramenta para aquele agente.  
O objetivo desse projeto foi aprender sobre RAG e sobre como o langchain funciona na prática.    

### Requisitos de software e bibliotecas:    
-> Node e NPM.  
-> MongoDB.    
-> OPENAI.
-> Langchain.

### Links úteis:   
Video base que guiou esse projeto: https://www.youtube.com/watch?v=qXDrWKVSx1w&list=WL&index=3&t=809s    