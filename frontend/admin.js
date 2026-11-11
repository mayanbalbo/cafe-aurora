const areaLogin = document.getElementById('area-login');
const painelAdmin = document.getElementById('painel-admin');
const formularioLogin = document.getElementById('form-login');
const mensagemLogin = document.getElementById('mensagem-login');
const mensagemPedidos = document.getElementById('mensagem-pedidos');
const listaPedidos = document.getElementById('lista-pedidos');
const botaoSair = document.getElementById('botao-sair');
const formularioProduto = document.getElementById('form-produto');
const listaProdutosAdmin = document.getElementById('lista-produtos-admin');
const mensagemProduto = document.getElementById('mensagem-produto');
const campoProdutoId = document.getElementById('produto-id');
const campoProdutoNome = document.getElementById('produto-nome');
const campoProdutoDescricao = document.getElementById('produto-descricao');
const campoProdutoPreco = document.getElementById('produto-preco');
const campoProdutoImagem = document.getElementById('produto-imagem');
const botaoSalvarProduto = document.getElementById('botao-salvar-produto');
const botaoCancelarEdicao = document.getElementById('botao-cancelar-edicao');

const statusDisponiveis = [
    { valor: 'recebido', nome: 'Recebido' },
    { valor: 'em_preparacao', nome: 'Em preparação' },
    { valor: 'pronto', nome: 'Pronto' },
    { valor: 'saiu_para_entrega', nome: 'Saiu para entrega' },
    { valor: 'entregue', nome: 'Entregue' },
    { valor: 'cancelado', nome: 'Cancelado' }
];

function formatarPreco(valor) {
    return Number(valor).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function obterToken() {
    return sessionStorage.getItem('token-admin');
}

async function requisicaoAdmin(url, opcoes = {}) {
    const resposta = await fetch(url, {
        ...opcoes,
        headers: {
            ...opcoes.headers,
            Authorization: `Bearer ${obterToken()}`
        }
    });

    const dados = await resposta.json();

    if (resposta.status === 401) {
        sessionStorage.removeItem('token-admin');
        mostrarLogin();
        throw new Error('Sua sessão expirou. Faça login novamente.');
    }

    if (!resposta.ok) {
        throw new Error(dados.erro || 'Ocorreu um erro.');
    }

    return dados;
}

function mostrarLogin() {
    areaLogin.hidden = false;
    painelAdmin.hidden = true;
    botaoSair.hidden = true;
}

function mostrarPainel() {
    areaLogin.hidden = true;
    painelAdmin.hidden = false;
    botaoSair.hidden = false;

    carregarProdutosAdmin();
}

formularioLogin.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    mensagemLogin.hidden = false;
    mensagemLogin.textContent = 'Verificando acesso...';

    const senha = document.getElementById('senha-admin').value;

    try {
        const resposta = await fetch('/api/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ senha })
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            throw new Error(dados.erro || 'Falha no login.');
        }

        sessionStorage.setItem('token-admin', dados.token);

        formularioLogin.reset();
        mensagemLogin.hidden = true;

        mostrarPainel();
        await carregarPedidos();

    } catch (erro) {
        mensagemLogin.textContent = erro.message;
    }
});

function criarCampo(texto) {
    const paragrafo = document.createElement('p');
    paragrafo.textContent = texto;
    return paragrafo;
}

function criarCartaoPedido(pedido) {
    const cartao = document.createElement('article');
    cartao.className = 'cartao-pedido';

    const titulo = document.createElement('h2');
    titulo.textContent = `Pedido nº ${pedido.id}`;

    const informacoes = document.createElement('div');
    informacoes.className = 'informacoes-pedido';

    informacoes.append(
        criarCampo(`Cliente: ${pedido.nome}`),
        criarCampo(`E-mail: ${pedido.email}`),
        criarCampo(`Telefone: ${pedido.telefone || 'Não informado'}`),
        criarCampo(
            `Endereço: ${pedido.endereco}, ${pedido.numero}` +
            `${pedido.complemento ? ' - ' + pedido.complemento : ''}, ` +
            `${pedido.bairro}, ${pedido.cidade} - CEP ${pedido.cep}`
        ),
        criarCampo(
            `Data: ${new Date(pedido.data_pedido).toLocaleString('pt-BR')}`
        ),
        criarCampo(`Total: ${formatarPreco(pedido.valor_total)}`)
    );

    const tituloItens = document.createElement('h3');
    tituloItens.textContent = 'Produtos';

    const listaItens = document.createElement('ul');

    pedido.itens.forEach(item => {
        const linha = document.createElement('li');

        linha.textContent =
            `${item.nome} — ${item.quantidade} unidade(s) — ` +
            `${formatarPreco(item.preco_unitario * item.quantidade)}`;

        listaItens.appendChild(linha);
    });

    const areaStatus = document.createElement('div');
    areaStatus.className = 'area-status';

    const labelStatus = document.createElement('label');
    labelStatus.textContent = 'Status do pedido';

    const seletor = document.createElement('select');

    statusDisponiveis.forEach(status => {
        const opcao = document.createElement('option');
        opcao.value = status.valor;
        opcao.textContent = status.nome;
        seletor.appendChild(opcao);
    });

    seletor.value = pedido.status;

    const botaoAtualizar = document.createElement('button');
    botaoAtualizar.className = 'botao';
    botaoAtualizar.type = 'button';
    botaoAtualizar.textContent = 'Atualizar status';

    botaoAtualizar.addEventListener('click', async () => {
        botaoAtualizar.disabled = true;

        try {
            const dados = await requisicaoAdmin(
                `/api/admin/pedidos/${pedido.id}/status`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        status: seletor.value
                    })
                }
            );

            mensagemPedidos.textContent = dados.mensagem;
            await carregarPedidos();

        } catch (erro) {
            mensagemPedidos.textContent = erro.message;

        } finally {
            botaoAtualizar.disabled = false;
        }
    });

    labelStatus.appendChild(seletor);

    areaStatus.append(labelStatus, botaoAtualizar);

    cartao.append(
        titulo,
        informacoes,
        tituloItens,
        listaItens,
        areaStatus
    );

    return cartao;
}

async function carregarPedidos() {
    mensagemPedidos.textContent = 'Carregando pedidos...';
    listaPedidos.replaceChildren();

    try {
        const pedidos = await requisicaoAdmin('/api/admin/pedidos');

        if (pedidos.length === 0) {
            mensagemPedidos.textContent = 'Nenhum pedido registrado.';
            return;
        }

        mensagemPedidos.textContent =
            `${pedidos.length} pedido(s) encontrado(s).`;

        pedidos.forEach(pedido => {
            listaPedidos.appendChild(criarCartaoPedido(pedido));
        });

    } catch (erro) {
        mensagemPedidos.textContent = erro.message;
    }
}

botaoSair.addEventListener('click', async () => {
    try {
        await requisicaoAdmin('/api/admin/logout', {
            method: 'POST'
        });
    } catch (erro) {
        console.error(erro);
    }

    sessionStorage.removeItem('token-admin');
    mostrarLogin();
});

if (obterToken()) {
    mostrarPainel();
    carregarPedidos();
} else {
    mostrarLogin();
}

async function carregarProdutosAdmin() {
    listaProdutosAdmin.replaceChildren();

    try {
        const produtos = await requisicaoAdmin('/api/admin/produtos');

        if (produtos.length === 0) {
            listaProdutosAdmin.textContent = 'Nenhum produto cadastrado.';
            return;
        }

        produtos.forEach(produto => {
            const cartao = document.createElement('article');
            cartao.className = 'cartao-produto-admin';

            const titulo = document.createElement('h3');
            titulo.textContent = produto.nome;

            const descricao = document.createElement('p');
            descricao.textContent = produto.descricao || 'Sem descrição.';

            const preco = document.createElement('p');
            preco.textContent = `Preço: ${formatarPreco(produto.preco)}`;

            const disponibilidade = document.createElement('p');
            disponibilidade.textContent = produto.disponivel
                ? 'Disponibilidade: Ativo'
                : 'Disponibilidade: Inativo';

            const botoes = document.createElement('div');
            botoes.className = 'botoes-produto-admin';

            const botaoEditar = document.createElement('button');
            botaoEditar.type = 'button';
            botaoEditar.className = 'botao';
            botaoEditar.textContent = 'Editar';

            botaoEditar.addEventListener('click', () => {
                campoProdutoId.value = produto.id;
                campoProdutoNome.value = produto.nome;
                campoProdutoDescricao.value = produto.descricao || '';
                campoProdutoPreco.value = Number(produto.preco).toFixed(2);
                campoProdutoImagem.value = produto.imagem_url || '';

                botaoSalvarProduto.textContent = 'Salvar alterações';
                botaoCancelarEdicao.hidden = false;

                formularioProduto.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            });

            const botaoDisponibilidade = document.createElement('button');
            botaoDisponibilidade.type = 'button';
            botaoDisponibilidade.className = 'botao botao-secundario';
            botaoDisponibilidade.textContent = produto.disponivel
                ? 'Desativar'
                : 'Ativar';

            botaoDisponibilidade.addEventListener('click', async () => {
                botaoDisponibilidade.disabled = true;

                try {
                    const dados = await requisicaoAdmin(
                        `/api/admin/produtos/${produto.id}/disponibilidade`,
                        {
                            method: 'PATCH',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                disponivel: !produto.disponivel
                            })
                        }
                    );

                    mensagemProduto.hidden = false;
                    mensagemProduto.textContent = dados.mensagem;

                    await carregarProdutosAdmin();

                } catch (erro) {
                    mensagemProduto.hidden = false;
                    mensagemProduto.textContent = erro.message;

                } finally {
                    botaoDisponibilidade.disabled = false;
                }
            });

            const botaoExcluir = document.createElement('button');
            botaoExcluir.type = 'button';
            botaoExcluir.className = 'botao botao-excluir';
            botaoExcluir.textContent = 'Excluir';

            botaoExcluir.addEventListener('click', async () => {
                const confirmar = window.confirm(
                    `Deseja realmente excluir o produto "${produto.nome}"?`
                );

                if (!confirmar) return;

                botaoExcluir.disabled = true;

                try {
                    const dados = await requisicaoAdmin(
                        `/api/admin/produtos/${produto.id}`,
                        { method: 'DELETE' }
                    );

                    mensagemProduto.hidden = false;
                    mensagemProduto.textContent = dados.mensagem;

                    await carregarProdutosAdmin();

                } catch (erro) {
                    mensagemProduto.hidden = false;
                    mensagemProduto.textContent = erro.message;

                } finally {
                    botaoExcluir.disabled = false;
                }
            });

            botoes.append(
                botaoEditar,
                botaoDisponibilidade,
                botaoExcluir
            );

            cartao.append(
                titulo,
                descricao,
                preco,
                disponibilidade,
                botoes
            );

            listaProdutosAdmin.appendChild(cartao);
        });

    } catch (erro) {
        mensagemProduto.hidden = false;
        mensagemProduto.textContent = erro.message;
    }
}

function limparFormularioProduto() {
    formularioProduto.reset();
    campoProdutoId.value = '';
    botaoSalvarProduto.textContent = 'Cadastrar produto';
    botaoCancelarEdicao.hidden = true;
}

formularioProduto.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const id = campoProdutoId.value;

    const produto = {
        nome: campoProdutoNome.value,
        descricao: campoProdutoDescricao.value,
        preco: Number(campoProdutoPreco.value),
        imagem_url: campoProdutoImagem.value.trim()
    };

    botaoSalvarProduto.disabled = true;

    try {
        const dados = await requisicaoAdmin(
            id ? `/api/admin/produtos/${id}` : '/api/admin/produtos',
            {
                method: id ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(produto)
            }
        );

        mensagemProduto.hidden = false;
        mensagemProduto.textContent = dados.mensagem;

        limparFormularioProduto();
        await carregarProdutosAdmin();

    } catch (erro) {
        mensagemProduto.hidden = false;
        mensagemProduto.textContent = erro.message;

    } finally {
        botaoSalvarProduto.disabled = false;
    }
});

botaoCancelarEdicao.addEventListener('click', () => {
    limparFormularioProduto();
    mensagemProduto.hidden = true;
});