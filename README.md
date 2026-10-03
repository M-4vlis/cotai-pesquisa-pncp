# CotAí — pesquisa de preços no PNCP

## Ideia original

Ferramenta online de pesquisa de preços em que a pessoa usuária envia uma planilha com os itens que deseja pesquisar. O sistema consulta as APIs públicas do PNCP, encontra preços correspondentes e retorna o preço acompanhado de um link direto para confirmação.

Para cada item, a pessoa define quantos preços quer receber. Os resultados são organizados por similaridade, para que itens incompatíveis não sejam apresentados como comparáveis.

O produto deve exigir o mínimo possível de recursos de servidor. Planilhas, pesquisas e resultados ficam no computador de quem realiza a consulta, permitindo uma aplicação online acessível sem banco de dados obrigatório na VPS.

## Decisões do MVP

- Aplicação estática e local-first.
- Persistência no `IndexedDB` do navegador.
- Importação de CSV e XLSX.
- Consulta ao PNCP feita pelo navegador quando permitida; há um campo para configurar um proxy leve caso a API exija CORS, controle de carga ou cache.
- Resultados trazem a descrição de origem, preço, unidade, órgão, data, similaridade e link de comprovação.
- O ranking seleciona os resultados mais comparáveis antes de ordenar por preço.

## Executar localmente

Abra `index.html` em um navegador moderno ou publique os arquivos em qualquer hospedagem estática.

## Formato mínimo da planilha

| descricao | unidade | quantidade |
| --- | --- | --- |
| Papel A4, 75 g/m², resma com 500 folhas | resma | 20 |

Também são aceitas as colunas opcionais `codigo_catalogo`, `catmat`, `catser` e `observacao`.

## Próximas evoluções

1. Validar em produção as rotas e CORS da API pública do PNCP.
2. Adicionar proxy sem estado com fila, cache curto e proteção contra excesso de requisições.
3. Melhorar a equivalência de unidades e embalagens.
4. Permitir exportação de relatório técnico em XLSX/PDF.
