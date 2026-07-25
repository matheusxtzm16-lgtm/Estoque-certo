"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
});
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const JWT_SECRET = process.env.JWT_SECRET || 'estoque_certo_secret_key_2026';
// ---------------------------------------------------------
// SIMULAÇÃO DE BANCO DE DADOS (Em memória para testes rápidos)
// ---------------------------------------------------------
const usuarios = [
    { id: 1, nome: 'Gestor Master', email: 'admin@estoque.com', senha_hash: bcryptjs_1.default.hashSync('123456', 10), role: 'admin' },
    { id: 2, nome: 'Operador João', email: 'operador@estoque.com', senha_hash: bcryptjs_1.default.hashSync('123456', 10), role: 'operador' }
];
let produtos = [
    { id: 1, nome: 'Parafusos Aço Inox', quantidade: 150, preco: 45.00 },
    { id: 2, nome: 'Chapa de Alumínio', quantidade: 30, preco: 320.00 }
];
const auditLogs = [];
// Função Auxiliar de Auditoria (Item 3)
function registrarAuditoria(req, acao, detalhes) {
    const ipCliente = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'IP desconhecido';
    const authHeader = req.headers.authorization;
    let usuarioNome = 'Sistema / Anônimo';
    if (authHeader) {
        try {
            const token = authHeader.split(' ')[1];
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            usuarioNome = decoded.nome;
        }
        catch (e) {
            // Token inválido ou expirado
        }
    }
    const logEntry = {
        usuario: usuarioNome,
        ip: ipCliente,
        acao: acao,
        detalhes: detalhes,
        data: new Date().toISOString()
    };
    auditLogs.push(logEntry);
    console.log('[AUDIT LOG]', logEntry);
}
// Middleware de Autenticação JWT
function verificarAutenticação(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ erro: 'Token não fornecido.' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.usuario = decoded;
        next();
    }
    catch (err) {
        return res.status(401).json({ erro: 'Token inválido ou expirado.' });
    }
}
// Middleware de Restrição para Administradores
function verificarAdmin(req, res, next) {
    verificarAutenticação(req, res, () => {
        if (req.usuario.role !== 'admin') {
            return res.status(403).json({ erro: 'Acesso negado! Recurso restrito a Administradores.' });
        }
        next();
    });
}
// ---------------------------------------------------------
// ROTAS DA API
// ---------------------------------------------------------
// Rota de Login (Item 2)
app.post('/api/login', async (req, res) => {
    const { email, senha } = req.body;
    const usuario = usuarios.find(u => u.email === email);
    if (!usuario) {
        return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }
    const senhaValida = await bcryptjs_1.default.compare(senha, usuario.senha_hash);
    if (!senhaValida) {
        return res.status(401).json({ erro: 'Credenciais inválidas.' });
    }
    const token = jsonwebtoken_1.default.sign({ id: usuario.id, nome: usuario.nome, role: usuario.role }, JWT_SECRET, { expiresIn: '8h' });
    registrarAuditoria(req, 'LOGIN', `Usuário ${usuario.nome} realizou login com sucesso.`);
    return res.json({ token, role: usuario.role, nome: usuario.nome });
});
// Listar Produtos
app.get('/api/produtos', (req, res) => {
    res.json(produtos);
});
// Cadastrar Produto (Disponível para Operador e Admin)
app.post('/api/produtos', verificarAutenticação, (req, res) => {
    const { nome, quantidade, preco } = req.body;
    const novoProduto = { id: produtos.length + 1, nome, quantidade, preco };
    produtos.push(novoProduto);
    registrarAuditoria(req, 'CADASTRO_PRODUTO', `Produto cadastrado: ${nome} (Qtd: ${quantidade})`);
    // Dispara atualização em Tempo Real via WebSocket (Item 1)
    io.emit('atualizar_inventario', { tipo: 'NOVO_PRODUTO', produtos });
    res.status(201).json({ mensagem: 'Produto cadastrado com sucesso!', produto: novoProduto });
});
// Excluir Produto (Restrito apenas a Administradores - Item 2)
app.delete('/api/produtos/:id', verificarAdmin, (req, res) => {
    const id = Number(req.params.id);
    const index = produtos.findIndex(p => p.id === id);
    if (index === -1) {
        return res.status(404).json({ erro: 'Produto não encontrado.' });
    }
    const produtoRemovido = produtos.splice(index, 1)[0];
    registrarAuditoria(req, 'EXCLUSAO_PRODUTO', `Produto excluído: ${produtoRemovido.nome}`);
    // Dispara atualização em Tempo Real via WebSocket (Item 1)
    io.emit('atualizar_inventario', { tipo: 'EXCLUSAO_PRODUTO', produtos });
    res.json({ mensagem: 'Produto excluído com sucesso!' });
});
// Listar Logs de Auditoria (Restrito para Admin ver a rastreabilidade)
app.get('/api/audit-logs', verificarAdmin, (req, res) => {
    res.json(auditLogs);
});
// ---------------------------------------------------------
// WEBSOCKETS CONEXÃO
// ---------------------------------------------------------
io.on('connection', (socket) => {
    console.log(`⚡ Novo cliente conectado via WebSocket: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`🔌 Cliente desconectado: ${socket.id}`);
    });
});
// Inicialização do Servidor HTTP + WebSocket
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor Enterprise rodando na porta ${PORT}!`);
});
