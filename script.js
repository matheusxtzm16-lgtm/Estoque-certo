// ==========================================================================
// 1. MAPEAMENTO DOS ELEMENTOS DO DOM (DOCUMENT OBJECT MODEL)
// ==========================================================================
const form = document.querySelector('.cadastro-form');
const tabelaInventario = document.querySelector('.inventory-table tbody');
const listaMovimentacoes = document.querySelector('.timeline-list');

// Elementos dos Cards do Dashboard
const cardItensCriticos = document.querySelector('.metric-card.alert .metric-value');
const cardTotalItens = document.querySelector('.metric-card.info .metric-value');
const cardMovimentacoes = document.querySelector('.metric-card.success .metric-value');

// ==========================================================================
// 2. ESTADO DA APLICAÇÃO (A NOSSA FONTE DE DADOS)
// ==========================================================================

// Buscamos os produtos salvos no LocalStorage. Se não houver nenhum, começamos com uma lista vazia.
let produtos = JSON.parse(localStorage.getItem('estoque_produtos')) || [];

// Mantemos o controle fictício das movimentações diárias para fins visuais
let totalMovimentacoesHoje = parseInt(localStorage.getItem('total_movimentacoes')) || 48;

// ==========================================================================
// 3. EVENTOS PRINCIPAIS
// ==========================================================================

// Evento executado assim que a página termina de carregar
document.addEventListener('DOMContentLoaded', function() {
    inicializarAplicacao();
});

// Evento de envio do formulário de cadastro
form.addEventListener('submit', function(event) {
    event.preventDefault();

    // Capturando os valores digitados pelo usuário
    const nome = document.getElementById('nome-produto').value;
    const sku = document.getElementById('codigo-sku').value;
    const categoria = document.getElementById('categoria').value;
    const quantidade = parseInt(document.getElementById('quantidade').value);
    const estoqueMinimo = parseInt(document.getElementById('estoque-minimo').value);

    // Criando um objeto único para o novo produto
    const novoProduto = {
        id: Date.now(), // Gera um ID único baseado no milissegundo atual
        sku: sku,
        nome: nome,
        categoria: categoria,
        quantidade: quantidade,
        estoqueMinimo: estoqueMinimo
    };

    // Adicionamos o novo produto ao nosso Array de produtos
    produtos.push(novoProduto);

    // Salvamos a lista atualizada no LocalStorage
    salvarNoLocalStorage();

    // Renderizamos o novo produto na tabela
    adicionarLinhaTabela(novoProduto);

    // Registramos a entrada na linha do tempo
    adicionarRegistroTimeline(nome, quantidade);

    // Atualizamos as métricas do Dashboard
    atualizarDashboard();

    // Limpamos os campos do formulário
    form.reset();
});

// ==========================================================================
// 4. FUNÇÕES DE INICIALIZAÇÃO E PERSISTÊNCIA
// ==========================================================================

// Função que renderiza tudo o que já estava salvo ao recarregar a página
function inicializarAplicacao() {
    // Limpa a tabela antes de carregar para não duplicar dados
    tabelaInventario.innerHTML = '';

    // Renderiza cada produto que já estava salvo
    produtos.forEach(produto => {
        adicionarLinhaTabela(produto);
    });

    // Atualiza os painéis do dashboard com base nos produtos carregados
    atualizarDashboard();
}

// Função para salvar a lista de produtos atual no LocalStorage
function salvarNoLocalStorage() {
    // O LocalStorage só aceita textos (strings). 
    // Usamos o JSON.stringify para transformar nosso Array de objetos em texto.
    localStorage.setItem('estoque_produtos', JSON.stringify(produtos));
    localStorage.setItem('total_movimentacoes', totalMovimentacoesHoje);
}

// ==========================================================================
// 5. FUNÇÕES AUXILIARES DE RENDERIZAÇÃO
// ==========================================================================

function adicionarLinhaTabela(produto) {
    const novaLinha = document.createElement('tr');

    // Definindo o Status do Estoque com base nos dados do produto
    let statusTexto = "Estável";
    let statusClasse = "success";

    if (produto.quantidade <= produto.estoqueMinimo) {
        statusTexto = "Estoque Crítico";
        statusClasse = "alert";
    }

    const categoriaExibicao = produto.categoria.replace('-', ' ').toUpperCase();

    novaLinha.innerHTML = `
        <td class="sku-cell">${produto.sku}</td>
        <td><strong>${produto.nome}</strong></td>
        <td><span class="badge badge-${produto.categoria}">${categoriaExibicao}</span></td>
        <td>${produto.quantidade} un</td>
        <td><span class="status-indicator ${statusClasse}">${statusTexto}</span></td>
        <td>
            <button type="button" class="btn-action edit" aria-label="Editar ${produto.nome}">✏️</button>
            <button type="button" class="btn-action delete" aria-label="Excluir ${produto.nome}">🗑️</button>
        </td>
    `;

    // Função de exclusão de item
    novaLinha.querySelector('.delete').addEventListener('click', function() {
        // Removemos o produto visualmente da tabela HTML
        novaLinha.remove();

        // Removemos o produto do nosso Array de dados filtrando pelo ID único dele
        produtos = produtos.filter(p => p.id !== produto.id);

        // Salvamos a nova lista (agora sem o item excluído) no LocalStorage
        salvarNoLocalStorage();

        // Atualizamos o Dashboard para refletir a saída do produto
        atualizarDashboard();
    });

    // Insere o novo produto no topo da tabela
    tabelaInventario.insertBefore(novaLinha, tabelaInventario.firstChild);
}

function adicionarRegistroTimeline(nome, quantidade) {
    const novoItem = document.createElement('li');
    novoItem.className = 'timeline-item status-entrada';

    const agora = new Date();
    const horaFormatada = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const isoString = agora.toISOString();

    novoItem.innerHTML = `
        <div class="timeline-marker"></div>
        <div class="timeline-content">
            <div class="timeline-header">
                <span class="badge badge-entrada">ENTRADA</span>
                <time datetime="${isoString}">Hoje às ${horaFormatada}</time>
            </div>
            <p class="timeline-text">
                Abastecimento de <strong>${quantidade} un</strong> de <em>${nome}</em> via formulário do sistema.
            </p>
            <span class="operator-tag">Responsável: Operador Logístico</span>
        </div>
    `;

    listaMovimentacoes.insertBefore(novoItem, listaMovimentacoes.firstChild);
    
    // Incrementa o número de movimentações e salva
    totalMovimentacoesHoje++;
    salvarNoLocalStorage();
}

function atualizarDashboard() {
    // Calculando métricas dinâmicas a partir do nosso array de produtos ativo
    let totalPecas = 0;
    let itensCriticos = 0;

    produtos.forEach(produto => {
        totalPecas += produto.quantidade;
        if (produto.quantidade <= produto.estoqueMinimo) {
            itensCriticos++;
        }
    });

    // Atualiza a interface física do usuário
    cardTotalItens.textContent = totalPecas.toLocaleString('pt-BR');
    cardMovimentacoes.textContent = `+${totalMovimentacoesHoje}`;
    cardItensCriticos.textContent = String(itensCriticos).padStart(2, '0');
}