// Função para buscar os vouchers da API
async function fetchVouchers() {
    try {
        const response = await fetch('/vouchers');
        const vouchers = await response.json();

        // Se não houver vouchers
        if (vouchers.length === 0) {
            document.querySelector('tbody').innerHTML = '<tr><td colspan="4">Nenhum voucher encontrado</td></tr>';
            return;
        }

        // Preencher a tabela com os dados
        const tableBody = document.querySelector('#voucherTable tbody');
        tableBody.innerHTML = ''; // Limpar a tabela antes de inserir novos dados

        vouchers.forEach(voucher => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${voucher.voucher_code}</td>
                <td>${voucher.validity_duration}</td>
                <td>${voucher.created_at}</td>
                <td>${voucher.updated_at}</td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Erro ao buscar os vouchers:', error);
    }
}

// Chamar a função para carregar os vouchers assim que a página for carregada
window.onload = fetchVouchers;
