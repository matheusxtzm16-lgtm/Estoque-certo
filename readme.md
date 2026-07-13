# 🛡️ EstoqueCerto: Gestão Industrial

> Sistema moderno e responsivo de controle de inventário industrial e logística integrada, desenvolvido com foco em alta semântica, acessibilidade (WCAG) e persistência de dados local.

---

## 💻 Sobre o Projeto

O **EstoqueCerto** é uma aplicação web voltada para o setor de manufatura e indústria, projetada para simplificar a gestão de insumos, ferramentas e matérias-primas. O sistema permite o cadastro rápido de novos componentes, exibe métricas em tempo real por meio de um painel de controle (Dashboard) e rastreia todas as atividades através de uma linha do tempo de auditoria (Timeline).

Este projeto foi construído do absoluto zero utilizando **HTML5 Semântico**, **CSS3 Moderno** (com arquitetura de Design System e Grid/Flexbox) e **JavaScript Vanilla** (puro) para manipulação de dados em memória e no navegador.

---

## 🚀 Funcionalidades Principais

* **Painel de Controle em Tempo Real:** Cards dinâmicos que mostram o total de peças, volume de movimentações diárias e quantidade de itens em nível crítico.
* **Cadastro Automatizado:** Formulário inteligente com validação nativa que impede a entrada de dados inconsistentes ou quantidades negativas.
* **Filtro de Estoque Crítico:** O sistema calcula de forma autônoma se o item está abaixo do limite de segurança, aplicando alertas visuais vermelhos.
* **Tabela de Inventário Responsiva:** Listagem com linhas zebradas para fácil acompanhamento visual, badges categorizadas por tipo de insumo e botões para exclusão dinâmica de registros.
* **Linha do Tempo (Timeline) de Auditoria:** Log cronológico das operações realizadas no sistema, registrando automaticamente a data, hora e o operador responsável.
* **Persistência com LocalStorage:** Os dados cadastrados não são perdidos se o navegador for fechado ou a página atualizada (F5).

---

## 🛠️ Tecnologias Utilizadas

A pilha de tecnologias foi selecionada para demonstrar conformidade com os melhores padrões da Web (W3C):

* **HTML5:** Estrutura altamente semântica (`<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<time>`) garantindo ótima indexação para SEO e compatibilidade com leitores de tela.
* **CSS3:** Uso de variáveis globais (`:root`) para padronização de cores, CSS Grid para layouts responsivos multidimensionais, Flexbox para alinhamentos lineares e micro-interações dinâmicas (efeitos de foco e cliques).
* **JavaScript (ES6+):** Manipulação eficiente do DOM, tratamento de eventos sem recarregamento de página (`event.preventDefault`), manipulação robusta de Arrays (`filter`, `forEach`, `push`) e integração com a API `Web Storage (LocalStorage)`.

---

## 📂 Estrutura de Arquivos

```text
estoquecerto/
├── index.html       # Estrutura e semântica do sistema
├── style.css        # Variáveis globais, reset e design responsivo
├── script.js        # Lógica de controle, manipulação do DOM e LocalStorage
└── README.md        # Documentação detalhada do projeto