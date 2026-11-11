
require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const app = express();
const crypto = require('crypto');

function validarImagemUrl(imagemUrl) {
    if (imagemUrl === undefined || imagemUrl === null || imagemUrl === '') {
        return true;
    }

    if (typeof imagemUrl !== 'string' || imagemUrl.length > 500) {
        return false;
    }

    try {
        const url = new URL(imagemUrl);
        return ['http:', 'https:'].includes(url.protocol);
    } catch {
        return false;
    }
}

const tokensAdmin = new Set();

const statusPermitidos = [
    'recebido',
    'em_preparacao',
    'pronto',
    'saiu_para_entrega',
    'entregue',
    'cancelado'
];

function autenticarAdmin(req, res, next) {
    const autorizacao = req.headers.authorization;

    if (!autorizacao || !autorizacao.startsWith('Bearer ')) {
        return res.status(401).json({
            erro: 'Acesso não autorizado.'
        });
    }

    const token = autorizacao.slice(7);

    if (!tokensAdmin.has(token)) {
        return res.status(401).json({
            erro: 'Sessão inválida. Faça login novamente.'
        });
    }

    next();
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const dbConfig = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

app.get('/', (req, res) => {
    res.send('Servidor da Cafeteria funcionando!');
});


app.get('/api/produtos', async (req, res) => {
    let conexao;

    try {
        conexao = await mysql.createConnection(dbConfig);

        const [produtos] = await conexao.execute(
            `SELECT id, nome, descricao, preco, imagem_url
             FROM produtos
             WHERE disponivel = TRUE
             ORDER BY nome`
        );

        res.json(produtos);
    } catch (erro) {
        console.error('Erro ao consultar produtos:', erro.message);

        res.status(500).json({
            erro: 'Não foi possível consultar os produtos.'
        });
    } finally {
        if (conexao) {
            await conexao.end();
        }
    }
});

app.get('/api/teste-banco', async (req, res) => {
    try {
        const conexao = await mysql.createConnection(dbConfig);
        const [resultado] = await conexao.query('SELECT DATABASE() AS banco');
        await conexao.end();

        res.json({
            mensagem: 'Conexão com o MySQL realizada com sucesso!',
            banco: resultado[0].banco
        });
    } catch (erro) {
        console.error('Erro ao conectar ao MySQL:', erro.message);

        res.status(500).json({
            erro: 'Não foi possível conectar ao banco de dados.'
        });
    }
});

app.post('/api/pedidos', async (req, res) => {
    let conexao;

    try {
        const {
            nome,
            email,
            telefone,
            endereco,
            numero,
            complemento,
            bairro,
            cidade,
            cep,
            itens
        } = req.body;

        // 1. Validar os dados do cliente
        const camposObrigatorios = [
            nome, email, endereco, numero,
            bairro, cidade, cep
        ];

        if (
            camposObrigatorios.some(
                campo => typeof campo !== 'string' || !campo.trim()
            )
        ) {
            return res.status(400).json({
                erro: 'Preencha todos os campos obrigatórios.'
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return res.status(400).json({
                erro: 'Informe um endereço de e-mail válido.'
            });
        }

        // 2. Validar os itens do pedido
        if (!Array.isArray(itens) || itens.length === 0) {
            return res.status(400).json({
                erro: 'O carrinho está vazio.'
            });
        }

        const ids = [];
        const itensValidados = [];

        for (const item of itens) {
            const produtoId = Number(item.produto_id);
            const quantidade = Number(item.quantidade);

            if (
                !Number.isInteger(produtoId) ||
                produtoId <= 0 ||
                !Number.isInteger(quantidade) ||
                quantidade <= 0 ||
                quantidade > 50 ||
                ids.includes(produtoId)
            ) {
                return res.status(400).json({
                    erro: 'Os produtos ou as quantidades do pedido são inválidos.'
                });
            }

            ids.push(produtoId);

            itensValidados.push({
                produto_id: produtoId,
                quantidade: quantidade
            });
        }

        conexao = await mysql.createConnection(dbConfig);

        await conexao.beginTransaction();

        // 3. Consultar os preços diretamente no banco de dados
        const marcadores = ids.map(() => '?').join(', ');

        const [produtos] = await conexao.execute(
            `SELECT id, nome, preco
             FROM produtos
             WHERE disponivel = TRUE
             AND id IN (${marcadores})`,
            ids
        );

        if (produtos.length !== ids.length) {
            await conexao.rollback();

            return res.status(400).json({
                erro: 'Um ou mais produtos não estão disponíveis.'
            });
        }

        // 4. Calcular o total usando os preços do banco
        const produtosPorId = new Map(
            produtos.map(produto => [produto.id, produto])
        );

        let totalEmCentavos = 0;

        for (const item of itensValidados) {
            const produto = produtosPorId.get(item.produto_id);

            const precoEmCentavos = Math.round(
                Number(produto.preco) * 100
            );

            totalEmCentavos +=
                precoEmCentavos * item.quantidade;
        }

        const valorTotal = (totalEmCentavos / 100).toFixed(2);

        // 5. Registrar o cliente
        const [resultadoCliente] = await conexao.execute(
            `INSERT INTO clientes
            (nome, email, telefone, endereco, numero,
             complemento, bairro, cidade, cep)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                nome.trim(),
                email.trim(),
                telefone?.trim() || null,
                endereco.trim(),
                numero.trim(),
                complemento?.trim() || null,
                bairro.trim(),
                cidade.trim(),
                cep.trim()
            ]
        );

        const clienteId = resultadoCliente.insertId;

        // 6. Registrar o pedido
        const [resultadoPedido] = await conexao.execute(
            `INSERT INTO pedidos (cliente_id, valor_total)
             VALUES (?, ?)`,
            [clienteId, valorTotal]
        );

        const pedidoId = resultadoPedido.insertId;

        // 7. Registrar cada produto do pedido
        for (const item of itensValidados) {
            const produto = produtosPorId.get(item.produto_id);

            await conexao.execute(
                `INSERT INTO itens_pedido
                (pedido_id, produto_id, quantidade, preco_unitario)
                VALUES (?, ?, ?, ?)`,
                [
                    pedidoId,
                    item.produto_id,
                    item.quantidade,
                    produto.preco
                ]
            );
        }

        // 8. Confirmar todas as operações
        await conexao.commit();

        res.status(201).json({
            mensagem: 'Pedido registrado com sucesso!',
            pedido_id: pedidoId,
            valor_total: valorTotal
        });

    } catch (erro) {
        if (conexao) {
            await conexao.rollback();
        }

        console.error('Erro ao registrar pedido:', erro.message);

        res.status(500).json({
            erro: 'Não foi possível registrar o pedido.'
        });

    } finally {
        if (conexao) {
            await conexao.end();
        }
    }
});

app.get('/api/pedidos/:id', async (req, res) => {
    let conexao;

    try {
        const pedidoId = Number(req.params.id);
        const email = req.query.email;

        if (
            !Number.isInteger(pedidoId) ||
            pedidoId <= 0 ||
            typeof email !== 'string' ||
            !email.trim()
        ) {
            return res.status(400).json({
                erro: 'Informe um número de pedido e um e-mail válido.'
            });
        }

        conexao = await mysql.createConnection(dbConfig);

        const [pedidos] = await conexao.execute(
            `SELECT
                p.id,
                p.data_pedido,
                p.status,
                p.valor_total,
                c.nome,
                c.email
             FROM pedidos p
             INNER JOIN clientes c ON c.id = p.cliente_id
             WHERE p.id = ?
             AND LOWER(c.email) = LOWER(?)`,
            [pedidoId, email.trim()]
        );

        if (pedidos.length === 0) {
            return res.status(404).json({
                erro: 'Pedido não encontrado. Confira os dados informados.'
            });
        }

        const [itens] = await conexao.execute(
            `SELECT
                pr.nome,
                ip.quantidade,
                ip.preco_unitario
             FROM itens_pedido ip
             INNER JOIN produtos pr ON pr.id = ip.produto_id
             WHERE ip.pedido_id = ?`,
            [pedidoId]
        );

        res.json({
            pedido: pedidos[0],
            itens: itens
        });

    } catch (erro) {
        console.error('Erro ao consultar pedido:', erro.message);

        res.status(500).json({
            erro: 'Não foi possível consultar o pedido.'
        });

    } finally {
        if (conexao) {
            await conexao.end();
        }
    }
});

// Login administrativo
app.post('/api/admin/login', (req, res) => {
    const { senha } = req.body;

    if (
        typeof senha !== 'string' ||
        typeof process.env.ADMIN_PASSWORD !== 'string'
    ) {
        return res.status(401).json({
            erro: 'Credenciais inválidas.'
        });
    }

    const senhaCorreta = Buffer.from(process.env.ADMIN_PASSWORD);
    const senhaInformada = Buffer.from(senha);

    if (
        senhaCorreta.length !== senhaInformada.length ||
        !crypto.timingSafeEqual(senhaCorreta, senhaInformada)
    ) {
        return res.status(401).json({
            erro: 'Senha incorreta.'
        });
    }

    const token = crypto.randomBytes(32).toString('hex');

    tokensAdmin.add(token);

    res.json({
        mensagem: 'Login realizado com sucesso.',
        token: token
    });
});

// Consultar pedidos para o painel administrativo
app.get('/api/admin/pedidos', autenticarAdmin, async (req, res) => {
    let conexao;

    try {
        conexao = await mysql.createConnection(dbConfig);

        const [pedidos] = await conexao.execute(
            `SELECT
                p.id,
                p.data_pedido,
                p.status,
                p.valor_total,
                c.nome,
                c.email,
                c.telefone,
                c.endereco,
                c.numero,
                c.complemento,
                c.bairro,
                c.cidade,
                c.cep
             FROM pedidos p
             INNER JOIN clientes c ON c.id = p.cliente_id
             ORDER BY p.data_pedido DESC`
        );

        if (pedidos.length === 0) {
            return res.json([]);
        }

        const idsPedidos = pedidos.map(pedido => pedido.id);
        const marcadores = idsPedidos.map(() => '?').join(', ');

        const [itens] = await conexao.execute(
            `SELECT
                ip.pedido_id,
                pr.nome,
                ip.quantidade,
                ip.preco_unitario
             FROM itens_pedido ip
             INNER JOIN produtos pr ON pr.id = ip.produto_id
             WHERE ip.pedido_id IN (${marcadores})`,
            idsPedidos
        );

        const pedidosComItens = pedidos.map(pedido => ({
            ...pedido,
            itens: itens.filter(item => item.pedido_id === pedido.id)
        }));

        res.json(pedidosComItens);

    } catch (erro) {
        console.error('Erro ao consultar pedidos administrativos:', erro.message);

        res.status(500).json({
            erro: 'Não foi possível carregar os pedidos.'
        });

    } finally {
        if (conexao) {
            await conexao.end();
        }
    }
});

// Atualizar status de um pedido
app.patch(
    '/api/admin/pedidos/:id/status',
    autenticarAdmin,
    async (req, res) => {
        let conexao;

        try {
            const pedidoId = Number(req.params.id);
            const { status } = req.body;

            if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
                return res.status(400).json({
                    erro: 'Número de pedido inválido.'
                });
            }

            if (!statusPermitidos.includes(status)) {
                return res.status(400).json({
                    erro: 'Status informado inválido.'
                });
            }

            conexao = await mysql.createConnection(dbConfig);

            const [resultado] = await conexao.execute(
                `UPDATE pedidos
                 SET status = ?
                 WHERE id = ?`,
                [status, pedidoId]
            );

            if (resultado.affectedRows === 0) {
                return res.status(404).json({
                    erro: 'Pedido não encontrado.'
                });
            }

            res.json({
                mensagem: 'Status atualizado com sucesso.'
            });

        } catch (erro) {
            console.error('Erro ao atualizar pedido:', erro.message);

            res.status(500).json({
                erro: 'Não foi possível atualizar o pedido.'
            });

        } finally {
            if (conexao) {
                await conexao.end();
            }
        }
    }
);

// Encerrar sessão administrativa
app.post('/api/admin/logout', autenticarAdmin, (req, res) => {
    const token = req.headers.authorization.slice(7);

    tokensAdmin.delete(token);

    res.json({
        mensagem: 'Sessão encerrada.'
    });
});

// Listar todos os produtos, inclusive indisponíveis
app.get('/api/admin/produtos', autenticarAdmin, async (req, res) => {
    let conexao;

    try {
        conexao = await mysql.createConnection(dbConfig);

        const [produtos] = await conexao.execute(
            `SELECT id, nome, descricao, preco, imagem_url, disponivel
             FROM produtos
             ORDER BY nome`
        );

        res.json(produtos);

    } catch (erro) {
        console.error('Erro ao consultar produtos:', erro.message);

        res.status(500).json({
            erro: 'Não foi possível consultar os produtos.'
        });

    } finally {
        if (conexao) await conexao.end();
    }
});

// Cadastrar produto
app.post('/api/admin/produtos', autenticarAdmin, async (req, res) => {
    let conexao;

    try {
        const { nome, descricao, preco, imagem_url } = req.body;

        if (
            typeof nome !== 'string' ||
            !nome.trim() ||
            nome.trim().length > 120 ||
            typeof descricao !== 'string' ||
            !Number.isFinite(Number(preco)) ||
            Number(preco) < 0 ||
            Number(preco) > 99999999.99
        ) {
            return res.status(400).json({
                erro: 'Informe nome, descrição e preço válidos.'
            });
        }

        if (!validarImagemUrl(imagem_url)) {
            return res.status(400).json({
                erro: 'Informe um endereço válido para a imagem (HTTP ou HTTPS).'
            });
        }

        conexao = await mysql.createConnection(dbConfig);

        const [resultado] = await conexao.execute(
            `INSERT INTO produtos
            (nome, descricao, preco, imagem_url, disponivel)
            VALUES (?, ?, ?, ?, TRUE)`,
            [
                nome.trim(),
                descricao.trim(),
                Number(preco).toFixed(2),
                imagem_url ? imagem_url.trim() : null
            ]
        );

        res.status(201).json({
            mensagem: 'Produto cadastrado com sucesso.',
            id: resultado.insertId
        });

    } catch (erro) {
        console.error('Erro ao cadastrar produto:', erro.message);

        res.status(500).json({
            erro: 'Não foi possível cadastrar o produto.'
        });

    } finally {
        if (conexao) await conexao.end();
    }
});

// Editar produto
app.put('/api/admin/produtos/:id', autenticarAdmin, async (req, res) => {
    let conexao;

    try {
        const produtoId = Number(req.params.id);
        const { nome, descricao, preco, imagem_url } = req.body;

        if (
            !Number.isInteger(produtoId) ||
            produtoId <= 0 ||
            typeof nome !== 'string' ||
            !nome.trim() ||
            nome.trim().length > 120 ||
            typeof descricao !== 'string' ||
            !Number.isFinite(Number(preco)) ||
            Number(preco) < 0 ||
            Number(preco) > 99999999.99
        ) {
            return res.status(400).json({
                erro: 'Informe dados válidos para o produto.'
            });
        }

        if (!validarImagemUrl(imagem_url)) {
            return res.status(400).json({
                erro: 'Informe um endereço válido para a imagem (HTTP ou HTTPS).'
            });
        }

        conexao = await mysql.createConnection(dbConfig);

        const [resultado] = await conexao.execute(
            `UPDATE produtos
             SET nome = ?, descricao = ?, preco = ?, imagem_url = ?
             WHERE id = ?`,
            [
                nome.trim(),
                descricao.trim(),
                Number(preco).toFixed(2),
                imagem_url ? imagem_url.trim() : null,
                produtoId
            ]
        );

        if (resultado.affectedRows === 0) {
            const [existentes] = await conexao.execute(
                'SELECT id FROM produtos WHERE id = ?',
                [produtoId]
            );

            if (existentes.length === 0) {
                return res.status(404).json({
                    erro: 'Produto não encontrado.'
                });
            }
        }

        res.json({
            mensagem: 'Produto atualizado com sucesso.'
        });

    } catch (erro) {
        console.error('Erro ao editar produto:', erro.message);

        res.status(500).json({
            erro: 'Não foi possível editar o produto.'
        });

    } finally {
        if (conexao) await conexao.end();
    }
});

// Alterar disponibilidade
app.patch(
    '/api/admin/produtos/:id/disponibilidade',
    autenticarAdmin,
    async (req, res) => {
        let conexao;

        try {
            const produtoId = Number(req.params.id);
            const { disponivel } = req.body;

            if (
                !Number.isInteger(produtoId) ||
                produtoId <= 0 ||
                typeof disponivel !== 'boolean'
            ) {
                return res.status(400).json({
                    erro: 'Dados inválidos.'
                });
            }

            conexao = await mysql.createConnection(dbConfig);

            const [resultado] = await conexao.execute(
                `UPDATE produtos
                 SET disponivel = ?
                 WHERE id = ?`,
                [disponivel, produtoId]
            );

            if (resultado.affectedRows === 0) {
                const [existentes] = await conexao.execute(
                    'SELECT id FROM produtos WHERE id = ?',
                    [produtoId]
                );

                if (existentes.length === 0) {
                    return res.status(404).json({
                        erro: 'Produto não encontrado.'
                    });
                }
            }

            res.json({
                mensagem: disponivel
                    ? 'Produto disponibilizado.'
                    : 'Produto desativado.'
            });

        } catch (erro) {
            console.error('Erro ao alterar disponibilidade:', erro.message);

            res.status(500).json({
                erro: 'Não foi possível alterar a disponibilidade.'
            });

        } finally {
            if (conexao) await conexao.end();
        }
    }
);

// Excluir produto que não esteja vinculado a pedidos
app.delete(
    '/api/admin/produtos/:id',
    autenticarAdmin,
    async (req, res) => {
        let conexao;

        try {
            const produtoId = Number(req.params.id);

            if (!Number.isInteger(produtoId) || produtoId <= 0) {
                return res.status(400).json({
                    erro: 'Número de produto inválido.'
                });
            }

            conexao = await mysql.createConnection(dbConfig);

            const [vinculos] = await conexao.execute(
                `SELECT COUNT(*) AS total
                 FROM itens_pedido
                 WHERE produto_id = ?`,
                [produtoId]
            );

            if (Number(vinculos[0].total) > 0) {
                return res.status(409).json({
                    erro: 'Este produto já aparece em pedidos. Desative-o em vez de excluí-lo.'
                });
            }

            const [resultado] = await conexao.execute(
                'DELETE FROM produtos WHERE id = ?',
                [produtoId]
            );

            if (resultado.affectedRows === 0) {
                return res.status(404).json({
                    erro: 'Produto não encontrado.'
                });
            }

            res.json({
                mensagem: 'Produto excluído com sucesso.'
            });

        } catch (erro) {
            console.error('Erro ao excluir produto:', erro.message);

            res.status(500).json({
                erro: 'Não foi possível excluir o produto.'
            });

        } finally {
            if (conexao) await conexao.end();
        }
    }
);

const porta = process.env.PORT || 3000;

app.listen(porta, () => {
    console.log(`Servidor iniciado em http://localhost:${porta}`);
});

