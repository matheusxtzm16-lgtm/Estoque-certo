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

// 3. Rota para Cadastrar Produto + Registrar Entrada Inicial (POST)
app.post('/api/produtos', async (req, res) => {
    try {
        const { codigo_barras, nome, categoria, quantidade, quantidade_minima, unidade_medida, usuario_id } = req.body;

        if (!nome || nome.trim() === '') {
            return res.status(400).json({ erro: 'O nome do produto é obrigatório.' });
        }

        const qtdInicial = parseInt(quantidade, 10) || 0;
        console.log('📦 Cadastrando produto:', { nome, categoria, quantidade: qtdInicial });

        // 3.1 Cadastra o produto no banco
        const { data, error } = await supabase
            .from('produtos')
            .insert([
                { 
                    codigo_barras: codigo_barras ? codigo_barras.trim() : '', 
                    nome: nome.trim(), 
                    categoria: categoria || 'materia-prima', 
                    quantidade: qtdInicial, 
                    quantidade_minima: parseInt(quantidade_minima, 10) || 0, 
                    unidade_medida: unidade_medida || 'un' 
                }
            ])
            .select();

        if (error) {
            console.error('❌ Erro de validação no Supabase:', error.message);
            return res.status(400).json({ erro: error.message });
        }

        const novoProduto = data ? data[0] : null;

        // 3.2 Se houver quantidade inicial (> 0), grava automaticamente a movimentação de ENTRADA
        if (novoProduto && qtdInicial > 0) {
            const { data: movData, error: movError } = await supabase
                .from('movimentacoes')
                .insert([
                    {
                        produto_id: novoProduto.id,
                        usuario_id: usuario_id || null,
                        tipo: 'ENTRADA',
                        quantidade: qtdInicial
                    }
                ])
                .select();

            if (movError) {
                console.error('⚠️ Produto criado, mas falhou ao gravar movimentação de entrada:', movError.message);
            } else if (movData && movData[0]) {
                io.emit('nova_movimentacao', movData[0]);
            }
        }

        // Notifica atualização na lista de produtos
        io.emit('atualizar_inventario');

        res.status(201).json({ mensagem: 'Produto cadastrado com sucesso!', produto: novoProduto });
    } catch (err) {
        console.error('❌ Erro na comunicação com Supabase:', err.message || err);
        res.status(500).json({ erro: 'Falha ao comunicar com o banco de dados.' });
    }
});

// 4. Rota para Registrar Saída / Baixa do Estoque (POST)
// Ajustada para aceitar tanto /api/movimentacoes/saida quanto POST direto em /api/movimentacoes quando o tipo for SAIDA
app.post(['/api/movimentacoes/saida', '/api/movimentacoes'], async (req, res) => {
    try {
        const { produto_id, quantidade, usuario_id, tipo } = req.body;

        // Se a rota chamada foi /api/movimentacoes genérica mas enviaram um tipo diferente (ou sem tipo sabendo que é saída), tratamos
        // Mantém total compatibilidade caso o front envie para /api/movimentacoes ou /api/movimentacoes/saida
        if (req.path === '/api/movimentacoes' && tipo && tipo !== 'SAIDA') {
            return res.status(400).json({ erro: 'Esta rota é exclusiva para saídas. Utilize o endpoint correto.' });
        }

        const qtdSaida = parseInt(quantidade, 10);

        if (!produto_id || isNaN(qtdSaida) || qtdSaida <= 0) {
            return res.status(400).json({ erro: 'Produto e quantidade válida são obrigatórios.' });
        }

        // 4.1 Busca o produto para verificar o estoque atual
        const { data: produto, error: errProd } = await supabase
            .from('produtos')
            .select('*')
            .eq('id', produto_id)
            .single();

        if (errProd || !produto) {
            return res.status(404).json({ erro: 'Produto não encontrado.' });
        }

        if (produto.quantidade < qtdSaida) {
            return res.status(400).json({ erro: 'Quantidade insuficiente em estoque.' });
        }

        // 4.2 Atualiza a quantidade do produto
        const novaQtd = produto.quantidade - qtdSaida;
        const { error: errUpdate } = await supabase
            .from('produtos')
            .update({ quantidade: novaQtd })
            .eq('id', produto_id);

        if (errUpdate) throw errUpdate;

        // 4.3 Registra a movimentação de SAÍDA
        const { data: movData, error: errMov } = await supabase
            .from('movimentacoes')
            .insert([
                {
                    produto_id: produto_id,
                    usuario_id: usuario_id || null,
                    tipo: 'SAIDA',
                    quantidade: qtdSaida
                }
            ])
            .select();

        if (errMov) throw errMov;

        // Emite atualizações em tempo real
        io.emit('atualizar_inventario');
        if (movData && movData[0]) {
            io.emit('nova_movimentacao', movData[0]);
        }

        res.json({ mensagem: 'Saída registrada com sucesso!', movimentacao: movData ? movData[0] : null });
    } catch (err) {
        console.error('❌ Erro ao registrar saída:', err.message || err);
        res.status(500).json({ erro: 'Falha ao registrar saída no banco de dados.' });
    }
});

// 5. Rota para Buscar Movimentações / Histórico para a Timeline (GET)
app.get('/api/movimentacoes', async (req, res) => {
    try {
        const { data: movimentacoes, error } = await supabase
            .from('movimentacoes')
            .select('*, produtos(*)')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ ERRO DETALHADO DO SUPABASE NA ROTA /api/movimentacoes:', error);
            throw error;
        }

        res.json(movimentacoes || []);
    } catch (err) {
        console.error('Erro ao buscar movimentações:', err.message || err);
        res.status(500).json({ erro: 'Erro ao buscar histórico de movimentações.', detalhe: err.message || err });
    }
});

// 6. Rota para Atualizar Produto (PUT)
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

// 7. Rota para Excluir Produto (DELETE)
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