# Custo por minuto de vídeo (fluxo na nuvem)

Valores medidos em 2026-10-05, em US$. Um vídeo de 1 minuto passa por: enviar o
áudio, transcrever (WhisperX), encaixar no áudio, renderizar (Lambda).

| Etapa | Custo por minuto de vídeo | Como foi medido |
|---|---|---|
| Transcrição: WhisperX no Replicate | **0,009 a 0,019** (mediana 0,018) | 7 execuções (Maiara 57,5 s ×6, Mechas 43,6 s ×1): tempo de processamento × US$ 0,0014/s (A100 80 GB). Modelos públicos cobram só o processamento. |
| Transcrição de reserva: Groq | 0,0019 | Preço público do whisper-large-v3 (US$ 0,111/h, mínimo de 10 s por pedido). Só quando o WhisperX falha. |
| Encaixe no áudio | 0 | Roda junto com o render (1–2 ms); a detecção de voz roda na máquina que transcreve. |
| Render: Lambda 2048 MB, 60 quadros por Lambda | **0,028** | Render 9-maiara-whisperx: US$ 0,0264 por 57,5 s (renders.json). Os renders anteriores ficaram entre 0,029 e 0,034/min. |
| **Total** | **0,037 a 0,047** | WhisperX + render. Com a Groq de reserva: ~0,030. |

Fora da conta (pequenos, não medidos): armazenamento e transferência do S3, e o
envio do áudio (~0,5 MB por minuto).

## Por que o WhisperX varia de 0,009 a 0,019

O processamento leva ~6 s quando a máquina do Replicate já tem o modelo de
alinhamento em português carregado e ~12–13 s quando precisa carregá-lo (o log
mostra "Duration to align output" de ~9 s). Não depende muito da duração do
vídeo: a Mechas (43,6 s) levou 9,9 s.

## Tempos (vídeo de 57,5 s)

| Etapa | Tempo |
|---|---|
| Enviar o áudio (MP3 64 kbps, ~460 KB) | 1,4–2,1 s |
| Espera na fila do Replicate | 0 s na maioria; 13,2 s uma vez |
| WhisperX (processamento) | 6–13 s |
| Transcrição inteira (envio + fila + WhisperX) | 10–30 s |
| Encaixe | 1–2 ms |
| Render no Lambda (60 quadros/Lambda, 29 Lambdas) | 55,6 s |
| Render local (esta máquina) | 137–181 s |

Para recalcular: `npx tsx medicao/whisperx.ts --vezes 2` (WhisperX) e
`npx tsx nuvem/renderizar.ts ...` (Lambda, grava em nuvem/resultados/renders.json).
