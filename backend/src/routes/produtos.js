const express = require('express');
const router = express.Router();
const pool = require('../db');

// 1. Listar todos os produtos
router.get('/', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM produtos ORDER BY id DESC');
        res.json(resultado.rows);
    } catch (erro) {
        console.error('Erro ao buscar produtos:', erro);
        res.status(500).json({ erro: 'Erro interno ao buscar produtos.' });
    }
});

// 2. Cadastrar um novo produto
router.post('/', async (req, res) => {
    const { codigo_barras, nome, quantidade, quantidade_minima, unidade_medida, categoria } = req.body;

    if (!nome || nome.trim() === '') {
        return res.status(400).json({ erro: 'O nome do produto é obrigatório.' });
    }

    try {
        const query = `
            INSERT INTO produtos (codigo_barras, nome, quantidade, quantidade_minima, unidade_medida, categoria)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;
        const valores = [
            codigo_barras ? codigo_barras.trim() : '', 
            nome.trim(), 
            parseInt(quantidade, 10) || 0, 
            parseInt(quantidade_minima, 10) || 0, 
            unidade_medida || 'un', 
            categoria || 'materia-prima'
        ];
        
        const novoProduto = await pool.query(query, valores);
        
        res.status(201).json({
            mensagem: 'Produto cadastrado com sucesso!',
            produto: novoProduto.rows[0]
        });
    } catch (erro) {
        console.error('Erro ao cadastrar produto:', erro);
        res.status(500).json({ erro: 'Erro ao cadastrar o produto no banco de dados.' });
    }
});

// 3. Atualizar um produto existente (EDIÇÃO)
router.put('/:id', async (req, res) => {
    const produtoId = parseInt(req.params.id, 10);
    
    if (isNaN(produtoId)) {
        return res.status(400).json({ erro: 'ID do produto inválido.' });
    }

    const { codigo_barras, nome, quantidade, quantidade_minima, unidade_medida, categoria } = req.body;

    try {
        const query = `
            UPDATE produtos 
            SET codigo_barras = $1, nome = $2, quantidade = $3, quantidade_minima = $4, unidade_medida = $5, categoria = $6
            WHERE id = $7
            RETURNING *;
        `;
        const valores = [
            codigo_barras ? codigo_barras.trim() : '', 
            nome ? nome.trim() : '', 
            parseInt(quantidade, 10) || 0, 
            parseInt(quantidade_minima, 10) || 0, 
            unidade_medida || 'un', 
            categoria || 'materia-prima',
            produtoId
        ];
        
        const produtoAtualizado = await pool.query(query, valores);

        if (produtoAtualizado.rowCount === 0) {
            return res.status(404).json({ erro: 'Produto não encontrado no banco para atualização.' });
        }
        
        res.json({
            mensagem: 'Produto atualizado com sucesso!',
            produto: produtoAtualizado.rows[0]
        });
    } catch (erro) {
        console.error('Erro ao atualizar produto:', erro);
        res.status(500).json({ erro: 'Erro ao atualizar o produto no banco de dados.' });
    }
});

// 4. Excluir um produto
router.delete('/:id', async (req, res) => {
    const produtoId = parseInt(req.params.id, 10);

    if (isNaN(produtoId)) {
        return res.status(400).json({ erro: 'ID do produto inválido.' });
    }

    try {
        const resultado = await pool.query('DELETE FROM produtos WHERE id = $1 RETURNING *;', [produtoId]);

        if (resultado.rowCount === 0) {
            return res.status(404).json({ erro: 'Produto não encontrado no banco para exclusão.' });
        }

        res.json({ mensagem: 'Produto excluído com sucesso!' });
    } catch (erro) {
        console.error('Erro ao excluir produto:', erro);
        res.status(500).json({ erro: 'Erro ao excluir o produto.' });
    }
});

module.exports = router;