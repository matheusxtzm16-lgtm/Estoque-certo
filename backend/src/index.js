const express = require('express');
const cors = require('cors');
const produtosRoutes = require('./routes/produtos');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares essenciais
app.use(cors());
app.use(express.json());

// Registro das Rotas da API
app.use('/api/produtos', produtosRoutes);

// Rota de teste inicial para verificar se a API está online
app.get('/', (req, res) => {
    res.json({ mensagem: 'API do Estoque Certo rodando com sucesso!' });
});

// Inicialização do Servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});