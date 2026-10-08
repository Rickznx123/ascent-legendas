# Origem das fontes

Todas as fontes desta pasta vêm do Fontsource 5.3.0 (pacotes `@fontsource/<fonte>` no
npm, cópias das fontes do Google), nas instâncias estáticas de cada peso, em dois
arquivos por fonte: `latin` e `latin-ext`. Conferido em 08/10/2026: o primeiro
arquivo de cada fonte é idêntico byte a byte ao do pacote, e a licença declarada
no pacote é a SIL Open Font License 1.1 (OFL), que permite embutir as fontes no
projeto e usá-las nos vídeos exportados.

| fonte | pacote | licença | pacotes que usam |
|---|---|---|---|
| Inter Tight (300, 400, 500, 600, 700, 800; itálica 800, 900) | [@fontsource/inter-tight@5.3.0](https://www.npmjs.com/package/@fontsource/inter-tight) | OFL-1.1 | A, B, C, F e a marca d'água |
| Instrument Serif (itálica 400) | [@fontsource/instrument-serif@5.3.0](https://www.npmjs.com/package/@fontsource/instrument-serif) | OFL-1.1 | A e F |
| Playfair Display (itálica 500) | [@fontsource/playfair-display@5.3.0](https://www.npmjs.com/package/@fontsource/playfair-display) | OFL-1.1 | B |
| Hanken Grotesk (300, 400, 800) | [@fontsource/hanken-grotesk@5.3.0](https://www.npmjs.com/package/@fontsource/hanken-grotesk) | OFL-1.1 | D e E |
| Urbanist (itálica 500) | [@fontsource/urbanist@5.3.0](https://www.npmjs.com/package/@fontsource/urbanist) | OFL-1.1 | E |
| EB Garamond (itálica 700) | [@fontsource/eb-garamond@5.3.0](https://www.npmjs.com/package/@fontsource/eb-garamond) | OFL-1.1 | E |

Inter Tight 700 entrou em 08/10/2026 para o pacote F, baixada de
`https://cdn.jsdelivr.net/npm/@fontsource/inter-tight@5.3.0/files/`.

Para acrescentar uma fonte: baixe os dois arquivos do mesmo pacote e versão,
registre-os em `src/fontes.ts` e acrescente uma linha aqui.
