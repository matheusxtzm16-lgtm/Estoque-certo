require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch'); // Garante compatibilidade HTTP/DNS no Node no Windows

const app = express();
const server = http.createServer(app);

// Configuração do Socket.io
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

// Tratamento e limpeza das variáveis do .env
const supabaseUrl = process.env.SUPABASE_URL ? process.env.SUPABASE_URL.trim().replace(/\/+$/, '') : '';
const supabaseKey = process.env.SUPABASE_KEY ? process.env.SUPABASE_KEY.trim() : '';

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERRO CRÍTICO: Verifique as variáveis SUPABASE_URL e SUPABASE_KEY no seu arquivo .env!');
}

// Inicialização do Supabase utilizando o node-fetch customizado
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false
    },
    global: {
        fetch: fetch
    }
});

// Middlewares Globais
app.use(cors());
app.use(express.json());

// Servir arquivos estáticos da pasta public
const pastaPublica = path.join(__dirname, 'public');
app.use(express.static(pastaPublica));

// Rotas de Páginas HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(pastaPublica, 'login.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(pastaPublica, 'index.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(pastaPublica, 'login.html'));
});

// ==========================================================================
// ROTAS DA API
// ==========================================================================

// 1. Rota de Login
app.post('/api/auth/login', async (req, res) => {
    const { email, senha } = req.body;
    try {
        const { data: usuario, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !usuario || usuario.senha !== senha) {
            return res.status(401).json({ erro: 'E-mail ou senha inválidos' });
        }

        res.json({
            token: 'token-valido',
            nome: usuario.nome,
            role: usuario.role
        });
    } catch (err) {
        console.error('Erro no login:', err);
        res.status(500).json({ erro: 'Erro interno no servidor ao autenticar.' });
    }
});

// 2. Rota para Buscar Produtos (GET)
app.get('/api/produtos', async (req, res) => {
    try {
        const { data: produtos, error } = await supabase
            .from('produtos')
            .select('*')
            .order('id', { ascending: false });

        if (error) throw error;

        res.json(produtos || []);
    } catch (err) {
        console.error('Erro ao buscar produtos:', err.message || err);
        res.status(500).json({ erro: 'Erro ao buscar produtos do banco de dados.' });
    }
});

// 3. Rota para Cadastrar Produto (POST)
app.post('/api/produtos', async (req, res) => {
    try {
        const { codigo_barras, nome, categoria, quantidade, quantidade_minima, unidade_medida } = req.body;

        if (!nome || nome.trim() === '') {
            return res.status(400).json({ erro: 'O nome do produto é obrigatório.' });
        }

        console.log('📦 Cadastrando produto:', { nome, categoria, quantidade });

        const { data, error } = await supabase
            .from('produtos')
            .insert([
                { 
                    codigo_barras: codigo_barras ? codigo_barras.trim() : '', 
                    nome: nome.trim(), 
                    categoria: categoria || 'materia-prima', 
                    quantidade: parseInt(quantidade, 10) || 0, 
                    quantidade_minima: parseInt(quantidade_minima, 10) || 0, 
                    unidade_medida: unidade_medida || 'un' 
                }
            ])
            .select();

        if (error) {
            console.error('❌ Erro de validação no Supabase:', error.message);
            return res.status(400).json({ erro: error.message });
        }

        // Notifica clientes em tempo real via WebSocket
        io.emit('atualizar_inventario');

        res.status(201).json({ mensagem: 'Produto cadastrado com sucesso!', produto: data ? data[0] : null });
    } catch (err) {
        console.error('❌ Erro na comunicação com Supabase:', err.message || err);
        res.status(500).json({ erro: 'Falha ao comunicar com o banco de dados.' });
    }
});

// 4. Rota para Atualizar Produto (PUT) -> ADICIONADA/CORRIGIDA
app.put('/api/produtos/:id', async (req, res) => {
    const produtoId = parseInt(req.params.id, 10);

    if (isNaN(produtoId)) {
        return res.status(400).json({ erro: 'ID do produto inválido.' });
    }

    const { codigo_barras, nome, categoria, quantidade, quantidade_minima, unidade_medida } = req.body;

    try {
        console.log(`✏️ Atualizando produto ID ${produtoId}:`, { nome, quantidade });

        const { data, error } = await supabase
            .from('produtos')
            .update({
                codigo_barras: codigo_barras ? codigo_barras.trim() : '',
                nome: nome ? nome.trim() : '',
                categoria: categoria || 'materia-prima',
                quantidade: parseInt(quantidade, 10) || 0,
                quantidade_minima: parseInt(quantidade_minima, 10) || 0,
                unidade_medida: unidade_medida || 'un'
            })
            .eq('id', produtoId)
            .select();

        if (error) {
            console.error('❌ Erro ao atualizar no Supabase:', error.message);
            return res.status(400).json({ erro: error.message });
        }

        if (!data || data.length === 0) {
            return res.status(404).json({ erro: 'Produto não encontrado para atualização.' });
        }

        // Notifica clientes em tempo real via WebSocket
        io.emit('atualizar_inventario');

        res.json({ mensagem: 'Produto atualizado com sucesso!', produto: data[0] });
    } catch (err) {
        console.error('❌ Erro na atualização com Supabase:', err.message || err);
        res.status(500).json({ erro: 'Falha ao atualizar o produto no banco de dados.' });
    }
});

// 5. Rota para Excluir Produto (DELETE) -> ADICIONADA/CORRIGIDA
app.delete('/api/produtos/:id', async (req, res) => {
    const produtoId = parseInt(req.params.id, 10);

    if (isNaN(produtoId)) {
        return res.status(400).json({ erro: 'ID do produto inválido.' });
    }

    try {
        console.log(`🗑️ Deletando produto ID: ${produtoId}`);

        const { data, error } = await supabase
            .from('produtos')
            .delete()
            .eq('id', produtoId)
            .select();

        if (error) {
            console.error('❌ Erro ao deletar no Supabase:', error.message);
            return res.status(400).json({ erro: error.message });
        }

        if (!data || data.length === 0) {
            return res.status(404).json({ erro: 'Produto não encontrado para exclusão.' });
        }

        // Notifica clientes em tempo real via WebSocket
        io.emit('atualizar_inventario');

        res.json({ mensagem: 'Produto excluído com sucesso!' });
    } catch (err) {
        console.error('❌ Erro ao excluir no Supabase:', err.message || err);
        res.status(500).json({ erro: 'Falha ao excluir o produto do banco de dados.' });
    }
});

// ==========================================================================
// EVENTOS WEBSOCKET E INICIALIZAÇÃO
// ==========================================================================
io.on('connection', (socket) => {
    console.log(`⚡ Cliente conectado via WebSocket: ${socket.id}`);

    socket.on('disconnect', () => {
        console.log(`🔌 Cliente desconectado: ${socket.id}`);
    });
});

// Teste automático de conexão ao iniciar o servidor
async function testarConexaoSupabase() {
    try {
        const { data, error } = await supabase.from('produtos').select('id').limit(1);
        if (error) {
            console.error('❌ Supabase respondeu com erro:', error.message);
        } else {
            console.log('✅ Conexão com o Supabase estabelecida com sucesso!');
        }
    } catch (err) {
        console.error('❌ Erro ao conectar no Supabase:', err.message || err);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    testarConexaoSupabase();
});