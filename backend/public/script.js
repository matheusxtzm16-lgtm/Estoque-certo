// ==========================================================================
// 0. VERIFICAÇÃO DE AUTENTICAÇÃO (SEGURANÇA DA ROTA ANTI-LOOP)
// ==========================================================================
(function verificarAutenticacao() {
    const caminho = window.location.pathname;
    const paginaAtual = caminho.substring(caminho.lastIndexOf('/') + 1);

    if (paginaAtual !== 'login.html' && paginaAtual !== '') {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = './login.html';
        }
    }
})();

// ==========================================================================
// 1. MAPEAMENTO DOS ELEMENTOS DO DOM
// ==========================================================================
const form = document.querySelector('.cadastro-form');
const tabelaInventario = document.querySelector('.inventory-table tbody');
const listaMovimentacoes = document.querySelector('.timeline-list');
const btnSubmitForm = form ? form.querySelector('button[type="submit"]') : null;

// Campos do Formulário
const inputNome = document.getElementById('nome-produto');
const inputSku = document.getElementById('codigo-sku');
const selectCategoria = document.getElementById('categoria');
const inputQuantidade = document.getElementById('quantidade');
const inputEstoqueMinimo = document.getElementById('estoque-minimo');

// Controles de Busca e Filtros
const inputBusca = document.getElementById('input-busca');
const botoesFiltro = document.querySelectorAll('.filter-btn');
let categoriaAtiva = 'todos';

// Controle de Edição
let idProdutoEmEdicao = null;

const API_URL = 'http://localhost:3000/api/produtos';

let produtos = [];
let totalMovimentacoesHoje = parseInt(localStorage.getItem('total_movimentacoes')) || 48;

document.addEventListener('DOMContentLoaded', function() {
    inicializarSessaoUsuario();
    carregarProdutosDoServidor();
    inicializarWebSocket();
});

// ==========================================================================
// 1.1. GERENCIAMENTO DA SESSÃO (EXIBIÇÃO DE USUÁRIO E LOGOUT)
// ==========================================================================
function inicializarSessaoUsuario() {
    const displayUsername = document.getElementById('display-username');
    const btnLogout = document.getElementById('btn-logout');
    
    const nomeUsuario = localStorage.getItem('nome_usuario') || 'Usuário';
    const userRole = localStorage.getItem('role') || 'operador';

    if (displayUsername) {
        displayUsername.textContent = `${nomeUsuario} (${userRole.toUpperCase()})`;
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if (confirm('Deseja realmente sair do sistema?')) {
                localStorage.removeItem('token');
                localStorage.removeItem('role');
                localStorage.removeItem('nome_usuario');
                window.location.href = './login.html';
            }
        });
    }
}

// ==========================================================================
// 1.2. CONEXÃO WEBSOCKET (TEMPO REAL BLINDADA)
// ==========================================================================
function inicializarWebSocket() {
    try {
        if (typeof io === 'undefined') {
            console.warn('Socket.io não está disponível na aplicação.');
            return;
        }

        const socket = io('http://localhost:3000', {
            reconnectionAttempts: 3,
            timeout: 5000
        });

        socket.on('atualizar_inventario', (dados) => {
            console.log('Inventário atualizado via Socket!', dados);
            if (dados && Array.isArray(dados.produtos)) {
                produtos = dados.produtos;
                renderizarTabela();
                atualizarDashboard();
            }
        });

        socket.on('connect_error', () => {
            console.warn('Servidor WebSocket indisponível. Operando em modo HTTP.');
        });
    } catch (e) {
        console.warn('Erro ao carregar Socket.io:', e);
    }
}

// ==========================================================================
// 1.3. SISTEMA DE ALERTAS VISUAIS E SONOROS
// ==========================================================================
function tocarAlertaSonoro() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    } catch (e) {
        console.warn('Som bloqueado pelo navegador até haver clique do usuário.');
    }
}

function verificarAlertasCriticos(itensCriticosCount) {
    let banner = document.getElementById('banner-alerta-critico');

    if (itensCriticosCount > 0) {
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'banner-alerta-critico';
            banner.style.cssText = `
                background-color: #e74c3c;
                color: white;
                text-align: center;
                padding: 12px;
                font-weight: bold;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                z-index: 9999;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 15px;
            `;
            document.body.prepend(banner);
        }

        banner.innerHTML = `
            <span>⚠️ ATENÇÃO: Existem ${itensCriticosCount} produto(s) com estoque zerado ou abaixo do mínimo!</span>
            <a href="#inventario" style="color: white; text-decoration: underline; background: rgba(0,0,0,0.2); padding: 4px 8px; border-radius: 4px;">Ver Inventário</a>
        `;

        if (!window.alertaSonoroDisparado) {
            tocarAlertaSonoro();
            window.alertaSonoroDisparado = true;
        }
    } else {
        if (banner) banner.remove();
        window.alertaSonoroDisparado = false;
    }
}

// ==========================================================================
// 2. EVENTO DE CADASTRO E EDIÇÃO
// ==========================================================================
if (form) {
    form.addEventListener('submit', async function(event) {
        event.preventDefault();

        const nome = inputNome ? inputNome.value.trim() : '';
        const codigo_barras = inputSku ? inputSku.value.trim() : '';
        const categoria = selectCategoria ? selectCategoria.value : 'materia-prima';
        const quantidade = inputQuantidade ? (parseInt(inputQuantidade.value) || 0) : 0;
        const quantidade_minima = inputEstoqueMinimo ? (parseInt(inputEstoqueMinimo.value) || 0) : 0;
        const unidade_medida = 'un';

        if (!nome) {
            alert('Por favor, informe o nome do produto.');
            return;
        }

        const objetoProduto = {
            codigo_barras,
            nome,
            categoria,
            quantidade,
            quantidade_minima,
            unidade_medida
        };

        const token = localStorage.getItem('token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
            if (idProdutoEmEdicao) {
                // MODO EDIÇÃO
                const resposta = await fetch(`${API_URL}/${idProdutoEmEdicao}`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify(objetoProduto)
                });

                if (!resposta.ok) {
                    const errData = await resposta.json().catch(() => ({}));
                    throw new Error(errData.erro || errData.message || 'Erro ao atualizar produto no servidor.');
                }
                
                idProdutoEmEdicao = null;
                if (btnSubmitForm) {
                    btnSubmitForm.textContent = 'Cadastrar no Inventário';
                    btnSubmitForm.style.background = '';
                }

                alert('Produto atualizado com sucesso!');
            } else {
                // MODO CADASTRO
                const resposta = await fetch(API_URL, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(objetoProduto)
                });

                if (!resposta.ok) {
                    const errData = await resposta.json().catch(() => ({}));
                    throw new Error(errData.erro || errData.message || 'Erro ao salvar produto no servidor.');
                }

                adicionarRegistroTimeline(nome, quantidade);
            }

            await carregarProdutosDoServidor();
            form.reset();

        } catch (erro) {
            console.error('Erro de envio:', erro);
            alert(erro.message || 'Não foi possível se comunicar com o servidor.');
        }
    });
}

// Busca e Filtros
if (inputBusca) {
    inputBusca.addEventListener('input', () => renderizarTabela());
}

botoesFiltro.forEach(botao => {
    botao.addEventListener('click', function() {
        botoesFiltro.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        categoriaAtiva = this.getAttribute('data-filter');
        renderizarTabela();
    });
});

// ==========================================================================
// 3. REQUISIÇÕES E AÇÕES (API)
// ==========================================================================
async function carregarProdutosDoServidor() {
    try {
        const resposta = await fetch(API_URL);
        if (!resposta.ok) throw new Error('Servidor não retornou dados.');
        
        const dados = await resposta.json();
        produtos = Array.isArray(dados) ? dados : (dados.produtos || []);
        
        renderizarTabela();
        atualizarDashboard();
    } catch (erro) {
        console.error('Erro de API:', erro);
        if (tabelaInventario) {
            tabelaInventario.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #e74c3c; padding: 2rem;">Erro ao conectar com o servidor. Verifique se o backend está rodando em http://localhost:3000.</td></tr>`;
        }
    }
}

async function excluirProdutoDoServidor(id, linhaElemento) {
    if (!confirm('Deseja realmente excluir este produto?')) return;

    const token = localStorage.getItem('token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
        const resposta = await fetch(`${API_URL}/${id}`, { 
            method: 'DELETE',
            headers
        });

        if (!resposta.ok) {
            const errData = await resposta.json().catch(() => ({}));
            throw new Error(errData.erro || 'Não foi possível excluir.');
        }

        produtos = produtos.filter(p => p.id !== id);
        if (linhaElemento) linhaElemento.remove();
        atualizarDashboard();
    } catch (erro) {
        console.error('Erro de exclusão:', erro);
        alert(erro.message || 'Erro ao processar exclusão no servidor.');
    }
}

function prepararEdicao(produto) {
    idProdutoEmEdicao = produto.id;
    if (inputNome) inputNome.value = produto.nome || '';
    if (inputSku) inputSku.value = produto.codigo_barras || '';
    if (selectCategoria) selectCategoria.value = produto.categoria || 'materia-prima';
    if (inputQuantidade) inputQuantidade.value = produto.quantidade || 0;
    if (inputEstoqueMinimo) inputEstoqueMinimo.value = produto.quantidade_minima || 0;

    if (btnSubmitForm) {
        btnSubmitForm.textContent = 'Salvar Alterações';
        btnSubmitForm.style.background = '#e67e22';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================================================
// 4. RENDERIZAÇÃO DA TABELA E DASHBOARD
// ==========================================================================
function renderizarTabela() {
    if (!tabelaInventario) return;
    tabelaInventario.innerHTML = '';

    const termoBusca = inputBusca ? inputBusca.value.toLowerCase().trim() : '';

    const produtosFiltrados = produtos.filter(produto => {
        const correspondeCategoria = (categoriaAtiva === 'todos' || produto.categoria === categoriaAtiva);
        const skuStr = produto.codigo_barras ? produto.codigo_barras.toLowerCase() : '';
        const nomeStr = produto.nome ? produto.nome.toLowerCase() : '';
        return correspondeCategoria && (nomeStr.includes(termoBusca) || skuStr.includes(termoBusca));
    });

    if (produtosFiltrados.length === 0) {
        tabelaInventario.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #7f8c8d; padding: 2rem;">Nenhum produto encontrado.</td></tr>`;
        return;
    }

    produtosFiltrados.forEach(produto => {
        const novaLinha = document.createElement('tr');

        let statusTexto = "Estável";
        let statusClasse = "success";
        const qtdMin = produto.quantidade_minima !== undefined ? produto.quantidade_minima : 0;

        if (produto.quantidade === 0) {
            statusTexto = "Em Falta";
            statusClasse = "danger";
        } else if (produto.quantidade <= qtdMin) {
            statusTexto = "Próximo de Faltar";
            statusClasse = "warning";
        }

        const catFormatada = produto.categoria ? produto.categoria.replace('-', ' ').toUpperCase() : 'GERAL';

        novaLinha.innerHTML = `
            <td class="sku-cell">${produto.codigo_barras || '---'}</td>
            <td><strong>${produto.nome}</strong></td>
            <td><span class="badge badge-${produto.categoria}">${catFormatada}</span></td>
            <td>${produto.quantidade} un</td>
            <td><span class="status-indicator ${statusClasse}">${statusTexto}</span></td>
            <td>
                <button type="button" class="btn-action edit" title="Editar" style="margin-right: 8px; cursor: pointer; background: transparent; border: none; font-size: 1rem;">✏️</button>
                <button type="button" class="btn-action delete" title="Excluir" style="cursor: pointer; background: transparent; border: none; font-size: 1rem;">🗑️</button>
            </td>
        `;

        novaLinha.querySelector('.edit').addEventListener('click', () => prepararEdicao(produto));
        
        const btnDelete = novaLinha.querySelector('.delete');
        if (btnDelete) {
            btnDelete.addEventListener('click', () => excluirProdutoDoServidor(produto.id, novaLinha));
        }

        tabelaInventario.appendChild(novaLinha);
    });
}

function adicionarRegistroTimeline(nome, quantidade) {
    if (!listaMovimentacoes) return;

    const novoItem = document.createElement('li');
    novoItem.className = 'timeline-item status-entrada';

    const agora = new Date();
    const horaFormatada = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    novoItem.innerHTML = `
        <div class="timeline-marker"></div>
        <div class="timeline-content">
            <div class="timeline-header">
                <span class="badge badge-entrada">ENTRADA</span>
                <time>Hoje às ${horaFormatada}</time>
            </div>
            <p class="timeline-text">Abastecimento de <strong>${quantidade} un</strong> de <em>${nome}</em>.</p>
        </div>
    `;

    listaMovimentacoes.insertBefore(novoItem, listaMovimentacoes.firstChild);
    totalMovimentacoesHoje++;
    localStorage.setItem('total_movimentacoes', totalMovimentacoesHoje);
}

function atualizarDashboard() {
    let totalPecas = 0;
    let itensEmFalta = 0;
    let itensProximoFaltar = 0;
    
    let htmlEmFalta = "";
    let htmlProximoFaltar = "";
    let htmlTotais = "";

    let nomesEmFalta = [];
    let nomesProximoFaltar = [];
    let todosNomesResumo = [];

    const categoriasStats = {
        'materia-prima': { total: 0, html: '', itens: [] },
        'ferramentas': { total: 0, html: '', itens: [] },
        'insumos': { total: 0, html: '', itens: [] },
        'equipamentos': { total: 0, html: '', itens: [] },
        'epi': { total: 0, html: '', itens: [] },
        'embalagens': { total: 0, html: '', itens: [] }
    };

    produtos.forEach((produto) => {
        totalPecas += produto.quantidade;
        todosNomesResumo.push(produto.nome);

        const cat = produto.categoria || 'materia-prima';
        const catFormatada = cat.replace('-', ' ').toUpperCase();
        const qtdMin = produto.quantidade_minima !== undefined ? produto.quantidade_minima : 0;

        htmlTotais += `<div class="tooltip-row">🔹 <strong>${produto.nome}</strong> <span class="t-badge">${catFormatada}</span>: <b>${produto.quantidade} un</b></div>`;

        if (produto.quantidade === 0) {
            itensEmFalta++;
            nomesEmFalta.push(produto.nome);
            htmlEmFalta += `<div class="tooltip-row">❌ <strong>${produto.nome}</strong> <span class="t-badge">${catFormatada}</span></div>`;
        } else if (produto.quantidade <= qtdMin) {
            itensProximoFaltar++;
            nomesProximoFaltar.push(produto.nome);
            htmlProximoFaltar += `<div class="tooltip-row">⚠️ <strong>${produto.nome}</strong> <span class="t-badge">${catFormatada}</span> - Restam: <b>${produto.quantidade} un</b> (Mín: ${qtdMin})</div>`;
        }

        if (categoriasStats[cat]) {
            categoriasStats[cat].total += produto.quantidade;
            categoriasStats[cat].itens.push(produto.nome);
            categoriasStats[cat].html += `<div class="tooltip-row">📦 <strong>${produto.nome}</strong>: <b>${produto.quantidade} un</b></div>`;
        }
    });

    const totalCriticos = itensEmFalta + itensProximoFaltar;
    verificarAlertasCriticos(totalCriticos);

    const cardEmFaltaVal = document.querySelector('.metric-card.danger .metric-value');
    const cardProxFaltarVal = document.querySelector('.metric-card.warning .metric-value');
    const cardTotalVal = document.querySelector('.metric-card.info .metric-value');

    if (cardEmFaltaVal) cardEmFaltaVal.textContent = String(itensEmFalta).padStart(2, '0');
    if (cardProxFaltarVal) cardProxFaltarVal.textContent = String(itensProximoFaltar).padStart(2, '0');
    if (cardTotalVal) cardTotalVal.textContent = totalPecas.toLocaleString('pt-BR');

    const descEmFalta = document.getElementById('metric-faltam-desc');
    const descProx = document.getElementById('metric-proximo-faltar-desc');
    const descTotal = document.getElementById('metric-total-desc');

    if (descEmFalta) descEmFalta.textContent = nomesEmFalta.length > 0 ? `Esgotado: ${nomesEmFalta.join(', ')}` : 'Estoque zerado';
    if (descProx) descProx.textContent = nomesProximoFaltar.length > 0 ? `Alerta: ${nomesProximoFaltar.join(', ')}` : 'Dentro do limite seguro';
    if (descTotal) descTotal.textContent = todosNomesResumo.length > 0 ? `Cadastrados: ${todosNomesResumo.slice(-2).join(' | ')}` : 'Nenhum item cadastrado';

    const tooltipFalta = document.getElementById('tooltip-em-falta-texto');
    const tooltipProx = document.getElementById('tooltip-proximo-faltar-texto');
    const tooltipTotal = document.getElementById('tooltip-total-texto');

    if (tooltipFalta) tooltipFalta.innerHTML = itensEmFalta > 0 ? htmlEmFalta : '<span class="tooltip-empty">✅ Nenhum item em falta no estoque</span>';
    if (tooltipProx) tooltipProx.innerHTML = itensProximoFaltar > 0 ? htmlProximoFaltar : '<span class="tooltip-empty">✅ Todos os itens com estoque seguro</span>';
    if (tooltipTotal) tooltipTotal.innerHTML = produtos.length > 0 ? htmlTotais : '<span class="tooltip-empty">Nenhum item cadastrado</span>';
}