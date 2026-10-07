# Origem dos efeitos sonoros

Inventário de 07/10/2026. Nenhum arquivo foi alterado. **A origem e a licença de
todos os sons são desconhecidas**: preencher antes do lançamento pago (os sons vão
dentro dos vídeos exportados pelos assinantes).

| arquivo | origem | licença | link | situação |
|---|---|---|---|---|
| destaque/camera-flash.wav | desconhecida | desconhecida | — | a confirmar |
| destaque/shutter.wav | desconhecida | desconhecida | — | a confirmar |
| destaque/whoosh.wav | desconhecida | desconhecida | — | a confirmar |
| linear/typing-1.wav | desconhecida | desconhecida | — | a confirmar |
| linear/typing-2.wav | desconhecida | desconhecida | — | a confirmar |
| linear/typing-3.wav | desconhecida | desconhecida | — | a confirmar |
| linear/typing-4.wav | desconhecida | desconhecida | — | a confirmar |

Situação: **a confirmar** (origem não encontrada), **ok** (licença permite uso
comercial em vídeos de clientes, sem atribuição ou com a atribuição feita),
**trocar** (licença não permite ou não dá para comprovar).

## Detalhes

| arquivo | duração | formato | onde é usado |
|---|---|---|---|
| destaque/camera-flash.wav | 0,940 s | WAV 48 kHz, estéreo, 16 bits | sorteado para blocos de destaque |
| destaque/shutter.wav | 0,320 s | WAV 48 kHz, estéreo, 16 bits | sorteado para blocos de destaque |
| destaque/whoosh.wav | 0,820 s | WAV 48 kHz, estéreo, 16 bits | sorteado para blocos de destaque; começa 200 ms antes da palavra-chave (`src/sons-config.ts`) |
| linear/typing-1.wav | 0,430 s | WAV 48 kHz, estéreo, 16 bits | typing dos blocos lineares |
| linear/typing-2.wav | 0,615 s | WAV 48 kHz, estéreo, 16 bits | typing dos blocos lineares |
| linear/typing-3.wav | 0,775 s | WAV 48 kHz, estéreo, 16 bits | typing dos blocos lineares |
| linear/typing-4.wav | 0,765 s | WAV 48 kHz, estéreo, 16 bits | typing dos blocos lineares |

Onde entram, para todos: a escolha por bloco em `src/sons.ts` (destaque: sorteado,
sem repetir o anterior; linear: o typing mais longo que cabe na entrada das palavras; com 2 palavras ou
nada cabendo, o mais curto, `typing-1`; cortado
com fade de 60 ms no fim do bloco); a lista e o botão de ouvir no app
(`GET /sons/*` em `app/servidor/servidor.ts`, tela `app/web/celular/SonsCelular.tsx`);
o áudio do vídeo exportado (`src/KineticCaptionVideo.tsx`, no site do Lambda, que
leva a pasta `sons/` inteira).

## Pistas da origem

- Os sete arquivos foram gravados de uma vez, em 03/10/2026 às 11:09, e entraram no
  git no commit `48539ca` (04/10/2026, "estado após layout de celular"), sem nota
  de origem.
- Todos foram convertidos pelo ffmpeg (marca `Lavf60.16.100` no cabeçalho, único
  metadado): 48 kHz, estéreo, 16 bits, com durações em múltiplos de 5 ms. Ou seja,
  foram recortados e normalizados a partir de outros arquivos; o metadado original
  (autor, site, licença) se perdeu na conversão.
- Os nomes em inglês (`camera-flash`, `shutter`, `whoosh`, `typing`) lembram os de
  bancos de efeitos gratuitos (Pixabay, Mixkit, Freesound, ZapSplat), mas isso não
  comprova nada.
- Onde procurar: o histórico de downloads do navegador por volta de 03/10/2026, a
  pasta Downloads (arquivos .mp3/.wav originais, com nomes de banco de sons) e,
  se vieram de um editor (CapCut, Premiere), a biblioteca dele.

Se um som for trocado, rodar `npm run nuvem:site` antes de publicar (os sons entram
no nome da versão do site do Lambda; este arquivo, não).
