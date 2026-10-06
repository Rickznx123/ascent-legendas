# Como criar templates, pacotes e paletas

O visual das legendas vem de duas escolhas independentes:

- **Pacote**: o conjunto de layouts (fontes, tamanhos, posições, animações) e as regras de quando usar cada um. Fica em `templates/pacote-<nome>/`.
- **Paleta**: as cores. Fica em `paletas/<nome>.ts`.

Qualquer pacote funciona com qualquer paleta. O motor descobre sozinho as pastas e os arquivos que existem.

```powershell
npm.cmd run gerar -- teste.mp4 saida.mp4 --pacote b --paleta vermelho
npm.cmd run conferir -- teste.mp4 --usar-transcricao --template alternar --pacote a --paleta branco
```

Sem `--pacote` ou `--paleta`, o motor usa o que está salvo no `transcricao.json`. Se não houver nada salvo, usa o pacote `a` e a paleta `branco`. Os nomes escolhidos ficam gravados no `transcricao.json` (campos `pacote` e `paleta`).

Pacotes e paletas atuais:

| Pacote | Layouts | Referência |
|---|---|---|
| `a` | `layout-1` a `layout-7` | `templates/pacote-a/referencia.html` |
| `b` | `b1` a `b6` e `linear` | `templates/pacote-b/referencia.html` |
| `c` | `imobiliario` e `linear`, os dois com a estrutura `imobiliario` (Inter Tight); os nomes antigos `c1` a `c6` desenham com o novo | `templates/pacote-c/referencia.html` |
| `d` | `d1` a `d6` (d6 é a dupla) e `linear` (Hanken Grotesk) | `templates/pacote-d/referencia.html` |
| `e` | `e1` a `e6` e `linear` (Urbanist, Hanken Grotesk e EB Garamond) | `templates/pacote-e/referencia.html` |

| Paleta | Uso |
|---|---|
| `branco` | tudo branco (referência do pacote A) |
| `vermelho` | palavra-chave em degradê vermelho com brilho vermelho; resto branco |
| `amarelo` | palavra-chave em degradê amarelo com brilho dourado; resto branco |
| `areia` | degradê na horizontal, areia e branco (referência do pacote D) |
| `dourado`, `prata`, `rose`, `azul`, `verde`, `roxo` | degradês da referência do pacote D; resto branco |

## Pacotes

Um pacote é uma pasta `templates/pacote-<nome>/` com:

- **Layouts**: um arquivo `.ts` por layout. O nome do arquivo é o nome do layout.
- **`_pacote.ts`**: as regras de quando usar cada layout (obrigatório).
- **`_estilos.ts`** (opcional): peças compartilhadas pelos layouts do pacote. Arquivos que começam com `_` não viram layout.
- **`referencia.html`** (opcional): a referência visual aprovada. O motor não lê esse arquivo.

### Regras do pacote (`_pacote.ts`)

```ts
const pacote: PackageConfig = {
  linear: "linear",                // layout dos blocos que não são destaque
  highlight: [                     // destaques: vale a primeira regra que combinar
    {words: {max: 1}, templates: ["b4"]},
    {before: {min: 2, max: 2}, after: {max: 0}, templates: ["b4"]},
    {before: {min: 3}, after: {max: 0}, templates: ["b3", "b5"]},
    {templates: ["b1", "b6"]},     // sem condição: vale sempre
  ],
  threeLines: ["b1", "b6"],        // apoio em cima e embaixo (veja "Linha de cima")
};
```

- `before` e `after` contam as palavras antes e depois da palavra-chave; `words` conta as palavras do bloco.
- `protectedExpression: true` faz a regra valer só para blocos com expressão protegida.
- `dupla` (opcional): o layout de dupla do pacote (ex.: `"d6"`). Dois blocos seguidos ficam na tela ao mesmo tempo quando cada um tem até 4 palavras e o silêncio entre eles é menor que 0,4 s, no máximo uma dupla a cada 6 blocos (valores em `dupla` no `src/agrupamento-config.ts`). A dupla conta como um destaque no ritmo.
- `aliases` (opcional): nomes antigos de layouts que saíram do pacote, cada um apontando para o layout novo (ex.: `{c1: "imobiliario"}`). Projetos salvos com os nomes antigos continuam abrindo e exportando; os nomes antigos não aparecem na galeria.
- `maxLinearWords` (opcional): máximo de palavras do linear. Um linear maior é dividido em dois no ponto de menor penalidade do agrupador; um bloco com layout escolhido à mão não é dividido, só fica marcado "revisar". No modo misto, um linear maior não sorteia esse pacote.
- Com mais de um layout na lista, eles se alternam entre os blocos.

O ritmo é comum a todos os pacotes e fica em `src/rhythm-config.ts`: dois lineares e um destaque, nunca dois destaques seguidos. Blocos de uma palavra só ou com expressão protegida sempre viram destaque, a menos que o bloco anterior já seja destaque.

### Linha de cima dos destaques

A linha de apoio acima da palavra-chave só vale com pelo menos 2 palavras ou 10 caracteres (`linhaDeCima` em `src/agrupamento-config.ts`). Uma palavra curta sozinha em cima, como "Tem" acima de "novidade", é proibida. Quando isso aconteceria, o motor tenta, nesta ordem:

1. **Trocar a palavra-chave** por outra palavra forte do bloco, para que a linha de cima fique válida. Exemplo: "Tem novidade" / CHEGANDO.
2. **Juntar com o bloco seguinte** em três linhas (layouts de `threeLines`), com até 6 palavras: apoio, palavra-chave, apoio. Não junta através de um fim de frase nem cola dois destaques.
3. **Palavra-chave primeiro** e o resto embaixo (layouts de `threeLines`, sem linha de cima). Se a primeira palavra não for forte, o bloco fica linear.

A linha de cima depende da estrutura do layout. Em `escada` e `pilha`, a última palavra antes da chave desce para a linha do meio. A ordem da fala é sempre mantida. O agrupador também penaliza blocos sem saída (`linhaDeCimaInvalida`), para evitar o problema já na divisão.

### Criar um pacote novo

1. Copie uma pasta de pacote, por exemplo `templates/pacote-b/`, para `templates/pacote-c/`.
2. Altere os estilos dos layouts e, se mudar nomes de arquivos, ajuste o `_pacote.ts`.
3. Rode com `--pacote c`. Não é preciso registrar o pacote em nenhum outro lugar.

### O que vai em cada layout

- `family`: `destaque` ou `linear`.
- `structure`: como as palavras são distribuídas:
  - `apoio-serifa`: apoio em cima, palavra-chave embaixo.
  - `pesada-italica`: apoio, palavra-chave e complemento depois.
  - `escada`: apoio, a palavra logo antes da chave em itálico, palavra-chave.
  - `bloco`: a expressão protegida em duas linhas.
  - `uma-palavra`: só a palavra-chave.
  - `tres-linhas`: apoio em cima, palavra-chave, apoio embaixo (`supportBelow`).
  - `rotulo-rodape`: rótulo em cima, palavra-chave, rodapé; a última palavra do rodapé recebe `emphasis`.
  - `topo-selo`: topo (a última palavra recebe `emphasis`), palavra-chave, selo embaixo.
  - `dois-rotulos`: palavras de cima nas duas pontas, palavra-chave, complemento.
  - `pilha`: duas linhas antes da palavra-chave (a de baixo é a última palavra antes dela).
  - `dupla`: dois blocos seguidos na tela ao mesmo tempo. O layout descreve cada parte em `pair` (`first`, `second`, cada uma com sua estrutura, estilos e ajuste da palavra-chave) e onde fica cada grupo (`firstGroup`, `secondGroup`).
  - `linear`: palavras em sequência.
  - `imobiliario` (pacote C): o bloco se divide num grupo acima da cabeça e outro na altura do tronco (até 2 palavras: um grupo só, no peito). Artigos, preposições, conjunções e verbos de ligação são apoio (finos e pequenos); o resto é chave (peso 800, tamanho pelo número de letras). Uma chave por grupo recebe o preenchimento da paleta (números e medidas, sempre). Entrada palavra por palavra com motion blur num eixo só (filtro SVG por quadro), grupo de baixo alternando dos lados e de baixo a cada bloco, saída para cima em cascata. O desenho e os parâmetros ficam em `src/imobiliario.tsx` e `src/imobiliario-config.ts`; o layout só declara a estrutura.
- `styles`: CSS de cada papel (`block`, `support`, `supportBelow`, `keyword`, `keywordOuter`, `emphasis`, `complement`). As medidas em `cqw` equivalem a % da largura do vídeo; `em` é relativo ao tamanho da letra do próprio elemento.
- Posição: o `block` não define `position`, `left`, `top` nem `transform` (se definir, é ignorado). O centro do bloco vai para a posição escolhida na interface (padrão: 50% da largura e 68% da altura), dentro da margem segura de 5% a 95% da largura e 8% a 92% da altura. O alinhamento do texto (`textAlign`) continua sendo do layout.
- `keywordFit`: ajuste da palavra-chave, igual a `data-w` e `data-max` do HTML. `targetWidthPercent` é a largura alvo e `maxFontPercent` é o teto do tamanho da letra, os dois em % da largura do vídeo. O padding lateral da palavra-chave entra na largura medida, como no `offsetWidth` do HTML.
- `keywordPaint`: como a palavra-chave recebe a cor da paleta.
  - `texto` (padrão, pacote A): cor do texto mais `text-shadow`; `keywordEffect` escolhe `brilho` ou `sombra`.
  - `recorte` (pacote B): o preenchimento é recortado no texto (`background-clip`). Dê ao `keyword` uma folga interna nas laterais (padding com margem negativa igual), para as itálicas não serem cortadas. O brilho fica em `keywordOuter`, o elemento de fora, não no texto.
- `animations`: entrada de cada parte do layout. `word` e `keyword` são obrigatórias; `top` (linha de cima), `complement`, `below` (rodapé e selo), `labelLeft` e `labelRight` (os dois rótulos das pontas) e `linearPair` (linear de 2 palavras, uma entrada para cada) usam `word` quando não são dadas. Cada entrada tem duração, curva `cubic-bezier`, opacidade inicial, deslocamento vertical (`fromTranslateYEm`) e horizontal (`fromTranslateXEm`), desfoque e escala. Para animações como a piscada do D4, use `keyframes` com quadros-chave de opacidade e brilho (`[posição de 0 a 1, valor]`), como num `@keyframes` do CSS.
- `emphasis`: estilo da última palavra do rodapé (`rotulo-rodape`) ou do topo (`topo-selo`), quando a linha tem 2 palavras ou mais.
- Caixa-alta e minúsculas: use `textTransform` no estilo, nunca altere o texto do JSON. Inclinações (`rotate`) ficam na linha ou em `keywordOuter`, nunca na palavra animada.
- `maxCharactersPerLine` (só no linear): acima desse número de caracteres, a linha é quebrada em duas.

**Layouts nunca definem cor.** Use as variáveis que o motor preenche a partir da paleta:

- `var(--cor-apoio)`: texto que não é palavra-chave.
- `var(--cor-sombra)`: cor da sombra (use com `color-mix` para dar transparência).
- `var(--brilho-1)` e `var(--brilho-2)`: brilho perto da letra e brilho espalhado.
- `var(--chave)`: preenchimento da palavra-chave (o motor aplica sozinho).
- `var(--sombra)` e `var(--brilho)`: sombra e brilho prontos, com a geometria do pacote A.

## Paletas

Uma paleta é um arquivo `paletas/<nome>.ts`:

```ts
import type {Palette} from "../src/types";

const palette: Palette = {
  supportColor: "#ffffff",                          // texto que não é palavra-chave
  keywordFill: {type: "solida", color: "#ffffff"},  // palavra-chave
  glow: {
    inner: "rgba(255,255,255,.55)",                 // brilho perto da letra
    outer: "rgba(255,255,255,.28)",                 // brilho espalhado
    intensity: 1,                                   // 1 = como definido; 0 = sem brilho
  },
  shadow: {color: "#000000"},                       // sombra de todo o texto
};

export default palette;
```

`intensity` vai de 0 a 1 e multiplica a transparência das duas cores do brilho. Para um brilho mais forte, aumente a opacidade das cores.

Para uma palavra-chave em degradê:

```ts
keywordFill: {
  type: "degrade",
  angle: 180, // graus, como no CSS: 180 = de cima para baixo, 90 = da esquerda para a direita
  stops: [
    {color: "#ff3b2f", position: 0},
    {color: "#c40d0d", position: 100},
  ],
},
```

Nos layouts com pintura `texto` (pacote A), um degradê faz a sombra e o brilho da palavra-chave virarem `filter: drop-shadow`, para não cobrirem o degradê.

### Criar uma paleta nova

1. Copie uma paleta, por exemplo `paletas/vermelho.ts`, com outro nome, como `paletas/dourado.ts`.
2. Troque as cores.
3. Rode com `--paleta dourado`.

## Edição manual

Cada bloco do `transcricao.json` guarda `family`, `template` (por exemplo, `layout-2` ou `b4`) e `keyword`. Para mudar o layout ou a palavra-chave de um bloco, edite esses campos e renderize sem transcrever de novo:

```powershell
npm.cmd run gerar -- teste.mp4 saida.mp4 --usar-transcricao
```

As edições manuais são mantidas enquanto o pacote for o mesmo. Ao trocar de pacote, os layouts são escolhidos de novo. `--template alternar` também refaz a escolha, e `--template <layout>` força um layout em todos os blocos.

O comando `conferir` gera `saida.mp4` e um PNG por bloco em `conferencia/`.
