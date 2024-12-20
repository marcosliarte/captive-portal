const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
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
app.use(express.static(path.join(__dirname, 'public')));  // Para servir arquivos estáticos como CSS e JS

// Rota para gerar voucher
app.post('/generate-voucher', (req, res) => {
  const { validity_duration } = req.body;

  // Validação do campo 'validity_duration'
  if (!validity_duration || validity_duration <= 0) {
    return res.status(400).json({ error: 'A validade do voucher deve ser maior que zero.' });
  }

  const voucher_code = generateVoucherCode();
  const created_at = moment().format('YYYY-MM-DD HH:mm:ss');
  const updated_at = created_at;

  const query = `
    INSERT INTO vouchers (voucher_code, validity_duration, created_at, updated_at, used_count, is_deleted)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.execute(query, [voucher_code, validity_duration, created_at, updated_at, 0, false], (err, results) => {
    if (err) {
      console.error('Erro ao executar a consulta:', err);
      return res.status(500).json({ error: 'Erro ao gerar o voucher', details: err });
    }

    console.log('Voucher gerado com sucesso:', voucher_code);

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
  const query = 'SELECT * FROM vouchers WHERE is_deleted = FALSE';
  db.execute(query, (err, results) => {
    if (err) {
      console.error('Erro ao listar vouchers:', err);
      return res.status(500).send('Erro ao listar vouchers');
    }

    const formattedResults = results.map(voucher => ({
      ...voucher,
      created_at: moment(voucher.created_at).format('DD/MM/YYYY HH:mm:ss'),
      updated_at: moment(voucher.updated_at).format('DD/MM/YYYY HH:mm:ss'),
    }));

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

  const query = 'UPDATE vouchers SET validity_duration = ? WHERE id = ? AND is_deleted = FALSE';
  db.execute(query, [validity_duration, id], (err, results) => {
    if (err) {
      console.error('Erro ao atualizar o voucher:', err);
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
      console.error('Erro ao excluir o voucher:', err);
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

  const query = `
    SELECT id, voucher_code, validity_duration, used_count 
    FROM vouchers 
    WHERE voucher_code = ? AND is_deleted = FALSE
  `;
  db.execute(query, [voucher_code], (err, results) => {
    if (err) {
      console.error('Erro ao verificar o voucher:', err);
      return res.status(500).json({ error: 'Erro ao verificar o voucher', details: err });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Voucher inválido ou não encontrado' });
    }

    const voucher = results[0];

    if (voucher.used_count > 0) {
      return res.status(400).json({ error: 'Este voucher já foi utilizado' });
    }

    const ip = req.ip; // O IP do cliente
    const authenticated_at = moment().format('YYYY-MM-DD HH:mm:ss');

    const updateVoucherQuery = 'UPDATE vouchers SET used_count = used_count + 1 WHERE id = ?';
    db.execute(updateVoucherQuery, [voucher.id], (err) => {
      if (err) {
        console.error('Erro ao marcar o voucher como usado:', err);
        return res.status(500).json({ error: 'Erro ao marcar o voucher como usado', details: err });
      }

      const insertIpQuery = `
        INSERT INTO voucher_authentication_logs (voucher_id, voucher_code, validity_duration, ip_address, authenticated_at)
        VALUES (?, ?, ?, ?, ?)
      `;

      db.execute(insertIpQuery, [voucher.id, voucher.voucher_code, voucher.validity_duration, ip, authenticated_at], (err) => {
        if (err) {
          console.error('Erro ao registrar o IP e dados do voucher:', err);
          return res.status(500).json({ error: 'Erro ao registrar o IP e dados do voucher', details: err });
        }

        res.status(200).json({
          message: 'Voucher autenticado com sucesso! IP registrado.',
        });
      });
    });
  });
});

// Rota para servir o arquivo 'auth-voucher.html'
app.get('/auth-voucher', (req, res) => {
  res.sendFile(path.join(__dirname, 'auth-voucher.html')); // Serve o arquivo auth-voucher.html
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Nome de usuário e senha são obrigatórios.' });
  }

  const query = 'SELECT * FROM usuarios WHERE username = ?';
  db.execute(query, [username], (err, results) => {
    if (err) {
      console.error('Erro ao buscar usuário:', err);
      return res.status(500).json({ error: 'Erro ao autenticar o usuário', details: err });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const user = results[0];

    // Verificar se o campo password_hash existe
    if (!user.password_hash) {
      console.error('Senha do usuário não encontrada no banco de dados.');
      return res.status(500).json({ error: 'Senha não encontrada para este usuário.' });
    }

    console.log('Usuário encontrado:', user);  // Exibindo o usuário para verificar os dados

    bcrypt.compare(password, user.password_hash, (err, isMatch) => {
      if (err) {
        console.error('Erro ao comparar as senhas:', err);
        return res.status(500).json({ error: 'Erro ao autenticar o usuário', details: err });
      }

      if (!isMatch) {
        return res.status(400).json({ error: 'Senha incorreta' });
      }

      res.status(200).json({
        message: 'Login realizado com sucesso!',
        user: { username: user.username, role: user.role },
      });
    });
  });
});


// Iniciar o servidor
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
