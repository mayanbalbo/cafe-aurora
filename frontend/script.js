
const listaProdutos = document.getElementById('lista-produtos');
const mensagemErro = document.getElementById('mensagem-erro');
const listaCarrinho = document.getElementById('lista-carrinho');
const subtotalCarrinho = document.getElementById('subtotal-carrinho');
const totalCarrinho = document.getElementById('total-carrinho');
const botaoLimparCarrinho = document.getElementById('limpar-carrinho');

const carrinho = new Map();

function formatarPreco(preco) {
    return Number(preco).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function criarCartaoProduto(produto) {
    const cartao = document.createElement('article');
    cartao.className = 'produto';

    const imagem = document.createElement('div');
    imagem.className = 'produto-imagem';

    if (produto.imagem_url) {
        const foto = document.createElement('img');
        foto.src = produto.imagem_url;
        foto.alt = `Imagem de ${produto.nome}`;
        foto.loading = 'lazy';
        foto.referrerPolicy = 'no-referrer';

        foto.addEventListener('error', () => {
            imagem.replaceChildren();

            const simbolo = document.createElement('span');
            simbolo.textContent = '☕';
            simbolo.setAttribute('aria-hidden', 'true');

            imagem.appendChild(simbolo);
        }, { once: true });

        imagem.appendChild(foto);
    } else {
        imagem.textContent = '☕';
        imagem.setAttribute('aria-hidden', 'true');
    }

    const conteudo = document.createElement('div');
    conteudo.className = 'produto-conteudo';

    const nome = document.createElement('h3');
    nome.textContent = produto.nome;

    const descricao = document.createElement('p');
    descricao.textContent =
        produto.descricao || 'Produto da nossa cafeteria.';

    const preco = document.createElement('div');
    preco.className = 'produto-preco';
    preco.textContent = formatarPreco(produto.preco);

    const botaoAdicionar = document.createElement('button');
    botaoAdicionar.className = 'botao';
    botaoAdicionar.type = 'button';
    botaoAdicionar.textContent = 'Adicionar ao carrinho';

    botaoAdicionar.addEventListener('click', () => {
        adicionarAoCarrinho(produto);
    });

    conteudo.append(nome, descricao, preco, botaoAdicionar);
    cartao.append(imagem, conteudo);

    return cartao;
}

function adicionarAoCarrinho(produto) {
    const id = Number(produto.id);
    const itemExistente = carrinho.get(id);

    if (itemExistente) {
        itemExistente.quantidade += 1;
    } else {
        carrinho.set(id, {
            id: id,
            nome: produto.nome,
            preco: Number(produto.preco),
            quantidade: 1
        });
    }

    renderizarCarrinho();
}

function alterarQuantidade(id, variacao) {
    const item = carrinho.get(id);

    if (!item) {
        return;
    }

    item.quantidade += variacao;

    if (item.quantidade <= 0) {
        carrinho.delete(id);
    }

    renderizarCarrinho();
}

function removerDoCarrinho(id) {
    carrinho.delete(id);
    renderizarCarrinho();
}

function renderizarCarrinho() {
    listaCarrinho.replaceChildren();

    if (carrinho.size === 0) {
        const mensagem = document.createElement('p');
        mensagem.className = 'mensagem';
        mensagem.textContent = 'Seu carrinho está vazio.';
        listaCarrinho.appendChild(mensagem);
    }

    let total = 0;

    for (const item of carrinho.values()) {
        const subtotalItem = item.preco * item.quantidade;
        total += subtotalItem;

        const linha = document.createElement('article');
        linha.className = 'item-carrinho';

        const informacoes = document.createElement('div');
        informacoes.className = 'item-carrinho-info';

        const nome = document.createElement('h3');
        nome.textContent = item.nome;

        const preco = document.createElement('p');
        preco.textContent =
            `${formatarPreco(item.preco)} por unidade`;

        const subtotal = document.createElement('p');
        subtotal.textContent =
            `Subtotal: ${formatarPreco(subtotalItem)}`;

        informacoes.append(nome, preco, subtotal);

        const controles = document.createElement('div');
        controles.className = 'controles-quantidade';

        const botaoDiminuir = document.createElement('button');
        botaoDiminuir.className = 'botao-quantidade';
        botaoDiminuir.type = 'button';
        botaoDiminuir.textContent = '−';
        botaoDiminuir.setAttribute(
            'aria-label',
            `Diminuir quantidade de ${item.nome}`
        );
        botaoDiminuir.addEventListener('click', () => {
            alterarQuantidade(item.id, -1);
        });

        const quantidade = document.createElement('span');
        quantidade.textContent = String(item.quantidade);
        quantidade.setAttribute('aria-label', 'Quantidade');

        const botaoAumentar = document.createElement('button');
        botaoAumentar.className = 'botao-quantidade';
        botaoAumentar.type = 'button';
        botaoAumentar.textContent = '+';
        botaoAumentar.setAttribute(
            'aria-label',
            `Aumentar quantidade de ${item.nome}`
        );
        botaoAumentar.addEventListener('click', () => {
            alterarQuantidade(item.id, 1);
        });

        const botaoRemover = document.createElement('button');
        botaoRemover.className = 'botao-remover';
        botaoRemover.type = 'button';
        botaoRemover.textContent = 'Remover';
        botaoRemover.addEventListener('click', () => {
            removerDoCarrinho(item.id);
        });

        controles.append(
            botaoDiminuir,
            quantidade,
            botaoAumentar,
            botaoRemover
        );

        linha.append(informacoes, controles);
        listaCarrinho.appendChild(linha);
    }

    subtotalCarrinho.textContent = formatarPreco(total);
    totalCarrinho.textContent = formatarPreco(total);
}

async function carregarProdutos() {
    try {
        const resposta = await fetch('/api/produtos');

        if (!resposta.ok) {
            throw new Error('Falha ao consultar os produtos.');
        }

        const produtos = await resposta.json();

        listaProdutos.replaceChildren();

        if (produtos.length === 0) {
            listaProdutos.textContent =
                'Nenhum produto disponível no momento.';
            return;
        }

        produtos.forEach((produto) => {
            listaProdutos.appendChild(criarCartaoProduto(produto));
        });
    } catch (erro) {
        console.error(erro);
        listaProdutos.replaceChildren();
        mensagemErro.hidden = false;
    }
}

botaoLimparCarrinho.addEventListener('click', () => {
    carrinho.clear();
    renderizarCarrinho();
});

async function finalizarPedido(evento) {
    evento.preventDefault();

    const formulario = document.getElementById('form-checkout');
    const mensagem = document.getElementById('mensagem-checkout');
    const botaoConfirmar = formulario.querySelector(
        'button[type="submit"]'
    );

    mensagem.hidden = false;
    mensagem.textContent = '';

    if (carrinho.size === 0) {
        mensagem.textContent =
            'Adicione pelo menos um produto ao carrinho.';
        return;
    }

    const dadosFormulario = new FormData(formulario);

    const pedido = {
        nome: dadosFormulario.get('nome'),
        email: dadosFormulario.get('email'),
        telefone: dadosFormulario.get('telefone'),
        endereco: dadosFormulario.get('endereco'),
        numero: dadosFormulario.get('numero'),
        complemento: dadosFormulario.get('complemento'),
        bairro: dadosFormulario.get('bairro'),
        cidade: dadosFormulario.get('cidade'),
        cep: dadosFormulario.get('cep'),

        itens: Array.from(carrinho.values()).map(item => ({
            produto_id: item.id,
            quantidade: item.quantidade
        }))
    };

    botaoConfirmar.disabled = true;
    botaoConfirmar.textContent = 'Registrando pedido...';

    try {
        const resposta = await fetch('/api/pedidos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(pedido)
        });

        const resultado = await resposta.json();

        if (!resposta.ok) {
            throw new Error(
                resultado.erro || 'Não foi possível registrar o pedido.'
            );
        }

        mensagem.textContent =
            `Pedido nº ${resultado.pedido_id} registrado com sucesso! ` +
            `Total: ${formatarPreco(resultado.valor_total)}.`;

        formulario.reset();
        carrinho.clear();
        renderizarCarrinho();

    } catch (erro) {
        console.error('Erro ao finalizar pedido:', erro);

        mensagem.textContent = erro.message;

    } finally {
        botaoConfirmar.disabled = false;
        botaoConfirmar.textContent = 'Confirmar pedido';
    }
}

document.getElementById('form-checkout').addEventListener(
    'submit',
    finalizarPedido
);

renderizarCarrinho();
carregarProdutos();