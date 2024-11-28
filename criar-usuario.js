const bcrypt = require('bcrypt');
const saltRounds = 10;

const password = 'sua_senha_em_texto_simples';

bcrypt.hash(password, saltRounds, (err, hash) => {
  if (err) {
    console.error('Erro ao gerar o hash:', err);
    return;
  }
  
  // Agora você pode armazenar o hash na coluna `password_hash` no banco de dados
  const query = 'INSERT INTO usuarios (username, password_hash, role) VALUES (?, ?, ?)';
  db.execute(query, [username, hash, 'cliente'], (err, result) => {
    if (err) {
      console.error('Erro ao inserir usuário:', err);
      return;
    }
    console.log('Usuário registrado com sucesso!');
  });
});
