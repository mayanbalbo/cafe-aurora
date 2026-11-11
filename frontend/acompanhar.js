const formulario = document.getElementById('form-acompanhamento');
const mensagem = document.getElementById('mensagem-consulta');
const resultado = document.getElementById('resultado-pedido');
const dadosPedido = document.getElementById('dados-pedido');
const itensPedido = document.getElementById('itens-pedido');

function formatarPreco(valor) {
    return Number(valor).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function formatarStatus(status) {
    const nomes = {
        recebido: 'Recebido',
        em_preparacao: 'Em preparação',
        pronto: 'Pronto',
        saiu_para_entrega: 'Saiu para entrega',
        entregue: 'Entregue',
        cancelado: 'Cancelado'
    };

    return nomes[status] || status;
}

formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    mensagem.hidden = false;
    mensagem.textContent = 'Consultando pedido...';
    resultado.hidden = true;

    const pedidoId = document.getElementById('pedido-id').value;
    const email = document.getElementById('email').value;

    try {
        const resposta = await fetch(
            `/api/pedidos/${encodeURIComponent(pedidoId)}?email=${encodeURIComponent(email)}`
        );

        const dados = await resposta.json();

        if (!resposta.ok) {
            throw new Error(dados.erro || 'Erro ao consultar pedido.');
        }

        const pedido = dados.pedido;

        dadosPedido.replaceChildren();
        itensPedido.replaceChildren();

        const informacoes = [
            `Pedido: ${pedido.id}`,
            `Cliente: ${pedido.nome}`,
            `Data: ${new Date(pedido.data_pedido).toLocaleString('pt-BR')}`,
            `Status: ${formatarStatus(pedido.status)}`,
            `Total: ${formatarPreco(pedido.valor_total)}`
        ];

        informacoes.forEach((informacao) => {
            const paragrafo = document.createElement('p');
            paragrafo.textContent = informacao;
            dadosPedido.appendChild(paragrafo);
        });

        dados.itens.forEach((item) => {
            const linha = document.createElement('p');

            linha.textContent =
                `${item.nome} — ${item.quantidade} unidade(s) — ` +
                `${formatarPreco(item.preco_unitario * item.quantidade)}`;

            itensPedido.appendChild(linha);
        });

        mensagem.hidden = true;
        resultado.hidden = false;

    } catch (erro) {
        mensagem.textContent = erro.message;
    }
});