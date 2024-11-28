const express = require('express');
const mysql = require('mysql2');
const crypto = require('crypto');
const path = require('path');
const moment = require('moment');  // Importando o moment.js
const app = express();
const port = 3000;

// Configuração do banco de dados
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '91886129',  // Certifique-se de que a senha está correta
  database: 'captive-portal',  // Verifique se o banco de dados está correto
});

db.connect((err) => {
  if (err) {
    console.error('Erro na conexão com o banco de dados:', err);
    process.exit(1);
  } else {
    console.log('Conectado ao banco de dados');
  }
});

// Função para gerar o código do voucher
const generateVoucherCode = () => {
  const prefix = 'EXT';
  const randomString = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `${prefix}${randomString}`;
};

// Middleware para processar JSON no corpo da requisição
app.use(express.json());

// Rota para gerar voucher
app.post('/generate-voucher', (req, res) => {
  const { validity_duration } = req.body;

  // Validação do campo 'validity_duration'
  if (!validity_duration || validity_duration <= 0) {
    return res.status(400).json({ error: 'A validade do voucher deve ser maior que zero.' });
  }

  const voucher_code = generateVoucherCode();
  const created_at = new Date();
  const updated_at = created_at;

  const query = `
    INSERT INTO vouchers (voucher_code, validity_duration, created_at, updated_at, used_count, is_deleted)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.execute(query, [voucher_code, validity_duration, created_at, updated_at, 0, false], (err, results) => {
    if (err) {
      console.error('Erro ao executar a consulta:', err);  // Log de erro
      return res.status(500).json({ error: 'Erro ao gerar o voucher', details: err });
    }

    console.log('Voucher gerado com sucesso:', voucher_code); // Log de sucesso

    res.status(201).json({
      message: 'Voucher gerado com sucesso!',
      voucher: {
        voucher_code,
        validity_duration,
        created_at,
        updated_at,
      },
    });
  });
});

// Rota para listar todos os vouchers (somente os não excluídos)
app.get('/vouchers', (req, res) => {
  const query = 'SELECT * FROM vouchers WHERE is_deleted = FALSE'; // Filtrando vouchers não excluídos
  db.execute(query, (err, results) => {
    if (err) {
      return res.status(500).send('Erro ao listar vouchers');
    }

    // Formatar as datas antes de enviar para o cliente
    const formattedResults = results.map(voucher => ({
      ...voucher,
      created_at: moment(voucher.created_at).format('DD/MM/YYYY HH:mm:ss'),
      updated_at: moment(voucher.updated_at).format('DD/MM/YYYY HH:mm:ss'),
    }));

    // Construir o HTML diretamente
    let htmlContent = '<h1>Vouchers</h1>';
    htmlContent += '<table>';
    htmlContent += '<thead><tr><th>Voucher Code</th><th>Validity Duration</th><th>Created At</th><th>Updated At</th></tr></thead>';
    htmlContent += '<tbody>';

    formattedResults.forEach(voucher => {
      htmlContent += `
        <tr>
          <td>${voucher.voucher_code}</td>
          <td>${voucher.validity_duration}</td>
          <td>${voucher.created_at}</td>
          <td>${voucher.updated_at}</td>
        </tr>
      `;
    });

    htmlContent += '</tbody>';
    htmlContent += '</table>';

    // Enviar o HTML gerado como resposta
    res.send(htmlContent);
  });
});

// Rota para editar a duração de um voucher
app.put('/vouchers/:id', (req, res) => {
  const { id } = req.params;
  const { validity_duration } = req.body;

  if (!validity_duration || validity_duration <= 0) {
    return res.status(400).json({ error: 'A validade do voucher deve ser maior que zero.' });
  }

  const query = 'UPDATE vouchers SET validity_duration = ? WHERE id = ? AND is_deleted = FALSE';  // Só atualiza se não for excluído
  db.execute(query, [validity_duration, id], (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao atualizar o voucher', details: err });
    }
    if (results.affectedRows === 0) {
      return res.status(404).json({ error: 'Voucher não encontrado ou já excluído' });
    }
    res.status(200).json({ message: 'Voucher atualizado com sucesso!' });
  });
});

// Rota para excluir (marcar como excluído) um voucher
app.delete('/vouchers/:id', (req, res) => {
  const { id } = req.params;
  const query = 'UPDATE vouchers SET is_deleted = TRUE WHERE id = ?';

  db.execute(query, [id], (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao excluir o voucher', details: err });
    }
    if (results.affectedRows === 0) {
      return res.status(404).json({ error: 'Voucher não encontrado' });
    }
    res.status(200).json({ message: 'Voucher excluído com sucesso!' });
  });
});

// Rota para autenticar o voucher e registrar o IP do usuário, código do voucher e validade
app.post('/auth-voucher', (req, res) => {
  const { voucher_code } = req.body;

  if (!voucher_code) {
    return res.status(400).json({ error: 'Código do voucher é obrigatório' });
  }

  // Verifica se o voucher existe e não está excluído
  const query = 'SELECT id, voucher_code, validity_duration FROM vouchers WHERE voucher_code = ? AND is_deleted = FALSE';
  db.execute(query, [voucher_code], (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao verificar o voucher', details: err });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Voucher inválido ou não encontrado' });
    }

    // Se o voucher for encontrado, registra o IP do cliente e outros dados
    const voucher = results[0];
    const ip = req.ip; // O IP do cliente
    const authenticated_at = new Date();

    // Salvar o IP, código do voucher e validade na tabela voucher_authentication_logs
    const insertIpQuery = `
      INSERT INTO voucher_authentication_logs (voucher_id, voucher_code, validity_duration, ip_address, authenticated_at)
      VALUES (?, ?, ?, ?, ?)
    `;

    db.execute(insertIpQuery, [voucher.id, voucher.voucher_code, voucher.validity_duration, ip, authenticated_at], (err, insertResults) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao registrar o IP e dados do voucher', details: err });
      }

      // Retorna sucesso para o frontend
      res.status(200).json({
        message: 'Voucher autenticado com sucesso! IP registrado.',
      });
    });
  });
});

// Rota para servir o arquivo 'auth-voucher.html'
app.get('/auth-voucher', (req, res) => {
  res.sendFile(path.join(__dirname, 'auth-voucher.html')); // Serve o arquivo auth-voucher.html
});

// Rota para servir o arquivo 'index.html'
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html')); // Serve o arquivo index.html da pasta raiz
});

// Iniciar o servidor
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
