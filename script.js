document.getElementById('voucherForm').addEventListener('submit', async (event) => {
    event.preventDefault(); // Previne o envio padrão do formulário

    const validityDuration = document.getElementById('validity').value;

    // Verificar se a validade é um número válido
    if (validityDuration <= 0) {
      alert('A validade do voucher deve ser maior que zero.');
      return;
    }

    try {
      // Enviar a requisição para o servidor
      const response = await fetch('http://localhost:3000/generate-voucher', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          validity_duration: parseInt(validityDuration),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Exibir o voucher gerado
        document.getElementById('voucherCode').innerText = data.voucher.voucher_code;
        document.getElementById('voucherDuration').innerText = data.voucher.validity_duration;
        document.getElementById('voucherCreatedAt').innerText = new Date(data.voucher.created_at).toLocaleString();

        // Mostrar a seção de resultados
        document.getElementById('voucherResult').classList.remove('hidden');
      } else {
        alert(`Erro: ${data.error}`);
      }
    } catch (error) {
      alert('Erro ao se comunicar com o servidor.');
      console.error(error);
    }
});

