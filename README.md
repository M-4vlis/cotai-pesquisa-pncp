# CotAí — pesquisa de preços no PNCP

## Ideia original

Ferramenta online de pesquisa de preços em que a pessoa usuária envia uma planilha com os itens que deseja pesquisar. O sistema consulta as APIs públicas do PNCP, encontra preços correspondentes e retorna o preço acompanhado de um link direto para confirmação.

Para cada item, a pessoa define quantos preços quer receber. Os resultados são organizados por similaridade, para que itens incompatíveis não sejam apresentados como comparáveis.

O produto deve exigir o mínimo possível de recursos de servidor. Planilhas, pesquisas e resultados ficam no computador de quem realiza a consulta, permitindo uma aplicação online acessível sem banco de dados obrigatório na VPS.

## Decisões do MVP

- Aplicação estática e local-first.
- Persistência no `IndexedDB` do navegador.
- Importação de CSV e XLSX.
- Consulta ao CATMAT e ao PNCP feita pelo servidor da própria ferramenta; nenhuma configuração técnica é exigida da pessoa usuária.
- Resultados trazem a descrição de origem, preço, unidade, órgão, data, similaridade e link de comprovação.
- Cada preço mostra o número do item no PNCP e abre diretamente a página da contratação correspondente no portal.
- O ranking seleciona os resultados mais comparáveis antes de ordenar por preço.
- A classificação CATMAT usa recuperação em múltiplas consultas, fusão de rankings e reranqueamento por PDM, classe, grupo, objeto principal, sinônimos, variações ortográficas, medidas e características. Quando a busca textual não basta, entra uma busca hierárquica de contingência.
- Materiais de manutenção e construção civil recebem expansão de consulta e validação especializada para hidráulica, elétrica, alvenaria, pintura, ferragens, soldagem, ferramentas e manutenção mecânica.
- A similaridade dos preços considera separadamente descrição, objeto, CATMAT, unidade, números e medidas, com penalidades para especificações incompatíveis; não há mais pontuação mínima artificial.
- A resolução final usa uma arquitetura em cascata: recupera até oito candidatos, reranqueia pelo tipo principal e pelas especificações, testa automaticamente até quatro CATMAT distintos no PNCP e combina similaridade semântica com evidência de preços reais. Se o primeiro código não tiver resultados, a melhor alternativa compatível é selecionada sem intervenção do usuário.
- A pessoa usuária pode abrir as sugestões, escolher outro CATMAT e disparar uma nova consulta explícita ao PNCP apenas para aquele item, sem reprocessar toda a planilha.
- Quando a classificação automática falha ou o código correto não aparece nas sugestões, a pessoa usuária pode informar qualquer CATMAT manualmente. O código é validado no catálogo oficial antes da consulta ao PNCP.
- O menu oferece uma busca rápida de CATMAT por nome ou descrição do material, com melhor correspondência, alternativas e cópia do código.
- A navegação é dividida em páginas independentes para nova pesquisa, resultados, modelo, busca de CATMAT e configurações, sem empilhar as ferramentas em uma única tela.
- A identidade visual utiliza o logotipo oficial do CotAí em formato ICO multirresolução, com variantes para os temas claro e escuro. A interface acompanha automaticamente o modo de aparência do sistema operacional, inclusive quando ele muda durante o uso.
- As consultas externas usam fila com concorrência limitada, cache compartilhado, reaproveitamento de requisições idênticas, espera exponencial com variação aleatória, respeito ao `Retry-After`, paginação reduzida de contingência e confirmação incremental dos links do PNCP.
- A interface acompanha as quatro etapas da pesquisa, mostra indicadores consolidados e organiza os resultados em uma tabela responsiva.

## Executar localmente

Abra `index.html` em um navegador moderno ou publique os arquivos em qualquer hospedagem estática.

## Formato mínimo da planilha

| descricao | unidade | quantidade |
| --- | --- | --- |
| Papel A4, 75 g/m², resma com 500 folhas | resma | 20 |

Também são aceitas as colunas opcionais `codigo_catalogo`, `catmat`, `catser` e `observacao`.

## Próximas evoluções

1. Melhorar continuamente a equivalência de unidades e embalagens.
2. Ampliar a classificação para CATSER quando a descrição indicar serviço.
3. Permitir exportação de relatório técnico em XLSX/PDF.
