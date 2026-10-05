// Estado e funções da interface, usados pelos dois layouts (computador e celular).
// Aqui não há nada de tela: os layouts só mostram o que vem daqui e chamam as funções.
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import type {PlayerRef} from "@remotion/player";
import {
  PACOTE_MISTO,
  assignForStyle,
  clearBlockPalettes,
  clearBlockPositions,
  excludeBlock,
  removeWord,
  restoreBlock,
  setBlockPosition,
  markShortBlocks,
  novaSemente,
  setBlockPalette,
  setBlockSound,
  mergeWithNext,
  setKeyword,
  blocksToMixed,
  setLayout,
  setWordText,
  splitBefore,
  toggleReview,
} from "../../src/motor/blocos";
import type {Estilo, Projeto} from "../../src/motor/projeto";
import {configDosEfeitos, planejarEfeitos} from "../../src/sons";
import type {ArquivoSom, ConfigEfeitos} from "../../src/sons";
import {blocosNaTela, cortesDosExcluidos, sincroniaDoProjeto} from "../../src/entrada";
import {POSICAO_PADRAO} from "../../src/posicao";
import type {Posicao} from "../../src/posicao";
import {computeTimeline, findActiveBlockIndex} from "../../src/tempos";
import type {AssignedCaptionBlock, VideoMetadata} from "../../src/types";
import {api, executarTarefa} from "./api";
import type {Andamento, Catalogo} from "./api";
import type {Aviso} from "./Avisos";
import type {Salvamento} from "./BarraTopo";
import type {BlocoSelecionado} from "./Galeria";
import {ErroArquivoExiste, plataforma} from "./plataforma";
import type {VideoEscolhido} from "./plataforma";

export type Tarefa = {nome: string} & Andamento;

export type Exportado = {nome: string; caminho: string};

const nomeDoArquivo = (caminho: string): string => caminho.split(/[\\/]/u).pop() ?? caminho;

const ESPERA_PARA_SALVAR_MS = 600;

// Quantas edições dá para desfazer.
const PASSOS_DE_DESFAZER = 100;

const AVISO_SEM_SONS =
  "Sem efeitos sonoros: coloque .wav ou .mp3 em sons/destaque/ e sons/linear/ e clique em Recarregar templates.";

export type Editor = ReturnType<typeof useEditor>;

export const useEditor = () => {
  const [catalogo, setCatalogo] = useState<Catalogo>({pacotes: [], paletas: [], videos: []});
  const [video, setVideo] = useState<string>("");
  const [videoInfo, setVideoInfo] = useState<VideoMetadata>();
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [estilo, setEstilo] = useState<Estilo>();
  const [tarefa, setTarefa] = useState<Tarefa>();
  const [erro, setErro] = useState<string>();
  // Avisos: mensagens que somem sozinhas.
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const proximoAviso = useRef(0);
  const setAviso = (texto: string | undefined) => {
    if (texto === undefined) {
      setAvisos([]);
      return;
    }
    proximoAviso.current += 1;
    const id = proximoAviso.current;
    setAvisos((atuais) => [...atuais.filter((aviso) => aviso.texto !== texto), {id, texto}]);
  };
  const fecharAviso = useCallback((id: number) => setAvisos((atuais) => atuais.filter((aviso) => aviso.id !== id)), []);
  const [salvamento, setSalvamento] = useState<Salvamento>("salvo");
  const [blocoAtivo, setBlocoAtivo] = useState(-1);
  const [exportado, setExportado] = useState<Exportado>();
  const [sons, setSons] = useState<ArquivoSom[]>([]);
  // Galeria de templates: estilo com todos os pacotes (carregado quando o layout a
  // mostra) e o bloco escolhido na lista (-1: nenhum).
  const [galeriaAberta, setGaleriaAberta] = useState(false);
  const [estiloGaleria, setEstiloGaleria] = useState<Estilo>();
  const [blocoSelecionado, setBlocoSelecionado] = useState(-1);
  const playerRef = useRef<PlayerRef>(null);
  const ouvindo = useRef<HTMLAudioElement | null>(null);
  const salvarTimer = useRef<number | undefined>(undefined);

  const mostrarErro = (error: unknown) => setErro(error instanceof Error ? error.message : String(error));

  // Carrega catálogo, projeto salvo e estilo ao abrir.
  useEffect(() => {
    (async () => {
      const [novoCatalogo, salvo] = await Promise.all([api.catalogo(), api.projeto()]);
      setCatalogo(novoCatalogo);
      // Blocos curtos demais ficam marcados como "revisar" (a divisão não muda).
      if (salvo) {
        const marcados = markShortBlocks(salvo.blocks as AssignedCaptionBlock[]);
        if (marcados !== salvo.blocks) {
          salvo.blocks = marcados;
          await api.salvar(salvo);
        }
      }
      setProjeto(salvo);
      setVideo(salvo?.source ?? novoCatalogo.videos[0] ?? "");
      setEstilo(await api.estilo(salvo?.pacote, salvo?.paleta));
    })().catch(mostrarErro);
    // Sem sons (ou com erro ao ler a pasta), os efeitos só ficam desativados.
    api
      .sons()
      .catch(() => [])
      .then((lidos) => {
        setSons(lidos);
        if (lidos.length === 0) {
          setAviso(AVISO_SEM_SONS);
        }
      });
  }, []);

  useEffect(() => {
    setVideoInfo(undefined);
    if (video) {
      api.videoInfo(video).then(setVideoInfo).catch(mostrarErro);
    }
  }, [video]);

  // O projeto salvo pertence a um vídeo; para outro vídeo, só depois de transcrever.
  const projetoDoVideo = projeto && projeto.source === video ? projeto : null;
  const blocos = (projetoDoVideo?.blocks ?? []) as AssignedCaptionBlock[];
  const sincroniaMs = sincroniaDoProjeto(projetoDoVideo?.sincroniaMs);
  // Tempos de tela (entrada antes da fala + sincronia), os mesmos do render.
  const blocosNaTelaAtual = useMemo(
    () => (estilo ? blocosNaTela(blocos, estilo.templates, sincroniaMs) : blocos),
    [blocos, estilo, sincroniaMs],
  );
  const excluidos = (projetoDoVideo?.excluidos ?? []) as AssignedCaptionBlock[];
  // Onde começavam os blocos excluídos: o bloco anterior sai ali (sem esticar).
  const cortesMs = useMemo(
    () => (estilo ? cortesDosExcluidos(excluidos, estilo.templates, sincroniaMs) : []),
    [excluidos, estilo, sincroniaMs],
  );
  const timeline = useMemo(() => computeTimeline(blocosNaTelaAtual, cortesMs), [blocosNaTelaAtual, cortesMs]);
  const configEfeitos = useMemo(() => configDosEfeitos(projetoDoVideo?.efeitos), [projetoDoVideo?.efeitos]);
  // Os mesmos efeitos que o render vai usar (mesma semente, mesmos arquivos).
  const efeitos = useMemo(
    () =>
      estilo
        ? planejarEfeitos(blocos, estilo.templates, sons, configEfeitos, projetoDoVideo?.semente ?? 0, sincroniaMs, cortesMs)
        : [],
    [blocos, estilo, sons, configEfeitos, projetoDoVideo?.semente, sincroniaMs, cortesMs],
  );
  const posicaoGeral = projetoDoVideo?.posicao ?? POSICAO_PADRAO;

  // O estado do salvamento aparece na barra de cima, ao lado do nome do vídeo.
  const salvar = useCallback((novo: Projeto, imediato = false) => {
    window.clearTimeout(salvarTimer.current);
    const enviar = () => {
      setSalvamento("salvando");
      return api
        .salvar(novo)
        .then(() => setSalvamento((atual) => (atual === "salvando" ? "salvo" : atual)))
        .catch((error: unknown) => {
          setSalvamento("erro");
          mostrarErro(error);
        });
    };
    if (imediato) {
      return enviar();
    }
    setSalvamento("pendente");
    salvarTimer.current = window.setTimeout(enviar, ESPERA_PARA_SALVAR_MS);
    return Promise.resolve();
  }, []);
  // Um salvamento ainda pendente traria as edições antigas de volta.
  const cancelarSalvamento = () => {
    window.clearTimeout(salvarTimer.current);
    setSalvamento("salvo");
  };

  // registrar: a mudança entra no histórico de desfazer (Ctrl+Z / Ctrl+Y).
  const atualizarProjeto = (mudanca: Partial<Projeto>, imediato = false, registrar = false) => {
    if (!projetoDoVideo) {
      return;
    }
    if (registrar) {
      guardarNoHistorico(projetoDoVideo);
    }
    const novo = {...projetoDoVideo, ...mudanca};
    if (mudanca.blocks) {
      // Blocos curtos demais ficam marcados como "revisar" (a divisão não muda).
      novo.blocks = markShortBlocks(mudanca.blocks as AssignedCaptionBlock[]);
    }
    setProjeto(novo);
    void salvar(novo, imediato);
  };

  // Edições da lista e da posição: entram no histórico.
  const editarProjeto = (mudanca: Partial<Projeto>) => atualizarProjeto(mudanca, false, true);
  const editarBlocos = (fn: (atuais: AssignedCaptionBlock[]) => AssignedCaptionBlock[]) =>
    editarProjeto({blocks: fn(blocos)});

  // Desfazer/refazer: guarda só o que as edições mudam (blocos, excluídos, posição).
  // Trocar de pacote, de vídeo ou transcrever limpa o histórico, porque os layouts
  // antigos seriam de outro estilo.
  type Passo = Pick<Projeto, "blocks" | "excluidos" | "posicao">;
  const historico = useRef<{desfazer: Passo[]; refazer: Passo[]}>({desfazer: [], refazer: []});
  const [, setVersaoDoHistorico] = useState(0);
  const passoDe = (atual: Projeto): Passo => ({blocks: atual.blocks, excluidos: atual.excluidos, posicao: atual.posicao});
  function guardarNoHistorico(atual: Projeto) {
    historico.current.desfazer = [...historico.current.desfazer, passoDe(atual)].slice(-PASSOS_DE_DESFAZER);
    historico.current.refazer = [];
    setVersaoDoHistorico((versao) => versao + 1);
  }
  const limparHistorico = () => {
    historico.current = {desfazer: [], refazer: []};
    setVersaoDoHistorico((versao) => versao + 1);
  };
  const andarNoHistorico = (de: "desfazer" | "refazer") => {
    const pilha = historico.current[de];
    const passo = pilha[pilha.length - 1];
    if (!projetoDoVideo || !passo) {
      return;
    }
    const para = de === "desfazer" ? "refazer" : "desfazer";
    historico.current = {
      ...historico.current,
      [de]: pilha.slice(0, -1),
      [para]: [...historico.current[para], passoDe(projetoDoVideo)],
    };
    setVersaoDoHistorico((versao) => versao + 1);
    setBlocoSelecionado((atual) => (atual < passo.blocks.length ? atual : -1));
    atualizarProjeto(passo);
  };
  const desfazer = () => andarNoHistorico("desfazer");
  const refazer = () => andarNoHistorico("refazer");
  const podeDesfazer = Boolean(projetoDoVideo) && historico.current.desfazer.length > 0;
  const podeRefazer = Boolean(projetoDoVideo) && historico.current.refazer.length > 0;

  // Ctrl+Z desfaz; Ctrl+Y (ou Ctrl+Shift+Z) refaz. Dentro de um campo de texto,
  // vale o desfazer do próprio campo.
  const atalhos = useRef({desfazer, refazer});
  atalhos.current = {desfazer, refazer};
  useEffect(() => {
    const aoTeclar = (event: KeyboardEvent) => {
      const alvo = event.target instanceof Element ? event.target : null;
      if (!(event.ctrlKey || event.metaKey) || alvo?.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      const tecla = event.key.toLowerCase();
      if (tecla === "z" && !event.shiftKey) {
        event.preventDefault();
        atalhos.current.desfazer();
      } else if (tecla === "y" || (tecla === "z" && event.shiftKey)) {
        event.preventDefault();
        atalhos.current.refazer();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  // Barra de espaço: toca e pausa a prévia de qualquer lugar da tela. Só num campo
  // de texto (palavra, sincronia) o espaço escreve. Nos botões e seletores o padrão
  // do navegador é cancelado, para o espaço não repetir o último botão clicado.
  useEffect(() => {
    const ehCampoDeTexto = (alvo: EventTarget | null): boolean => {
      if (!(alvo instanceof Element)) {
        return false;
      }
      if (alvo.closest("textarea, [contenteditable='true']")) {
        return true;
      }
      const tiposSemTexto = ["button", "checkbox", "radio", "range", "color", "file", "submit", "reset", "image"];
      return alvo instanceof HTMLInputElement && !tiposSemTexto.includes(alvo.type);
    };
    const ehEspaco = (event: KeyboardEvent) =>
      (event.code === "Space" || event.key === " ") && !event.ctrlKey && !event.metaKey && !event.altKey;
    const aoApertar = (event: KeyboardEvent) => {
      if (!ehEspaco(event) || ehCampoDeTexto(event.target)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) {
        playerRef.current?.toggle();
      }
    };
    // Botões disparam o clique do espaço ao soltar a tecla: cancela também aqui.
    const aoSoltar = (event: KeyboardEvent) => {
      if (ehEspaco(event) && !ehCampoDeTexto(event.target)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", aoApertar, true);
    window.addEventListener("keyup", aoSoltar, true);
    return () => {
      window.removeEventListener("keydown", aoApertar, true);
      window.removeEventListener("keyup", aoSoltar, true);
    };
  }, []);

  // Excluir um bloco ou uma palavra: o bloco excluído fica guardado em "excluidos".
  const aplicarExclusao = (resultado: {blocks: AssignedCaptionBlock[]; excluido?: AssignedCaptionBlock}) => {
    editarProjeto({
      blocks: resultado.blocks,
      ...(resultado.excluido ? {excluidos: [...excluidos, resultado.excluido]} : {}),
    });
    if (resultado.excluido) {
      setBlocoSelecionado(-1);
    }
  };
  const restaurarExcluido = (indice: number) => {
    if (!estilo || !excluidos[indice]) {
      return;
    }
    editarProjeto({
      blocks: restoreBlock(blocos, excluidos[indice], estilo),
      excluidos: excluidos.filter((_, posicao) => posicao !== indice),
    });
  };

  // Posição: arrastar mexe na geral ou, com "Só este bloco", só no bloco selecionado.
  const [moverLegenda, setMoverLegenda] = useState(false);
  const [soEsteBloco, setSoEsteBloco] = useState(false);
  // Marcar "só neste bloco" já liga o modo de mover: só a opção não arrastava nada.
  const marcarSoEsteBloco = (ligado: boolean) => {
    setSoEsteBloco(ligado);
    if (ligado) {
      setMoverLegenda(true);
    }
  };
  const blocoQueMove = soEsteBloco && blocos[blocoSelecionado] ? blocoSelecionado : -1;
  const posicaoQueMove = blocoQueMove >= 0 ? (blocos[blocoQueMove].posicao ?? posicaoGeral) : posicaoGeral;
  // Posição de um bloco (indice >= 0) ou a geral (-1), sem entrar no histórico (o
  // começo do arrasto já entrou).
  const moverPosicao = (indice: number, posicao: Posicao) => {
    if (indice >= 0) {
      atualizarProjeto({blocks: setBlockPosition(blocos, indice, posicao)});
    } else {
      atualizarProjeto({posicao});
    }
  };
  const moverPara = (posicao: Posicao) => moverPosicao(blocoQueMove, posicao);

  // Escolhe de novo os layouts de todos os blocos com as regras do(s) pacote(s).
  // No modo misto, a semente decide o sorteio. Layouts escolhidos à mão ficam.
  const refazerLayouts = (novoEstilo: Estilo, base: AssignedCaptionBlock[], semente: number) =>
    assignForStyle(base, novoEstilo, {semente});

  const trocarPacote = async (pacote: string) => {
    try {
      const novoEstilo = await api.estilo(pacote, estilo?.paleta);
      limparHistorico();
      setEstilo(novoEstilo);
      if (projetoDoVideo) {
        const semente = projetoDoVideo.semente ?? novaSemente();
        atualizarProjeto({pacote, semente, blocks: refazerLayouts(novoEstilo, blocos, semente)}, true);
        setAviso(
          pacote === PACOTE_MISTO
            ? "Modo misto: cada bloco sorteou um pacote."
            : `Layouts escolhidos de novo com as regras do pacote ${pacote}.`,
        );
      }
    } catch (error) {
      mostrarErro(error);
    }
  };

  // Modo misto: nova semente, novo sorteio (layouts escolhidos à mão ficam).
  const sortearDeNovo = () => {
    if (!projetoDoVideo || !estilo) {
      return;
    }
    const semente = novaSemente();
    atualizarProjeto({semente, blocks: refazerLayouts(estilo, blocos, semente)}, true);
    setAviso("Novo sorteio feito.");
  };

  const trocarPaleta = async (paleta: string) => {
    try {
      setEstilo(await api.estilo(estilo?.pacote, paleta));
      atualizarProjeto({paleta}, true);
    } catch (error) {
      mostrarErro(error);
    }
  };

  // Relê templates/ e paletas/ no servidor e atualiza a prévia.
  const recarregarTemplates = async () => {
    setErro(undefined);
    try {
      const novoCatalogo = await api.recarregar();
      setCatalogo(novoCatalogo);
      const novosSons = await api.sons();
      setSons(novosSons);
      const pacote =
        estilo && (estilo.pacote === PACOTE_MISTO || novoCatalogo.pacotes.includes(estilo.pacote))
          ? estilo.pacote
          : undefined;
      const paleta = estilo && novoCatalogo.paletas.includes(estilo.paleta) ? estilo.paleta : undefined;
      setEstilo(await api.estilo(pacote, paleta));
      setAviso("Templates e paletas recarregados.");
      if (novosSons.length === 0) {
        setAviso(AVISO_SEM_SONS);
      }
      setEstiloGaleria(undefined);
    } catch (error) {
      mostrarErro(error);
    }
  };

  // recomecar: "Recomeçar do zero" (as edições somem; efeitos sonoros e sincronia ficam).
  const transcrever = async (recomecar = false) => {
    if (!video) {
      return;
    }
    const nome = recomecar ? "Recomeçar do zero" : "Transcrever";
    // Um salvamento ainda pendente traria as edições antigas de volta.
    cancelarSalvamento();
    setErro(undefined);
    setAviso(undefined);
    setTarefa({nome, etapa: "Começando..."});
    try {
      const {projeto: novo} = await executarTarefa<{projeto: Projeto}>(
        "/api/transcrever",
        {video, pacote: estilo?.pacote, paleta: estilo?.paleta, manterAjustes: recomecar},
        (andamento) => setTarefa({nome, ...andamento}),
      );
      setProjeto(novo);
      limparHistorico();
      setBlocoSelecionado(-1);
      setEstilo(await api.estilo(novo.pacote, novo.paleta));
      setAviso(
        recomecar
          ? `Recomeçado do zero: transcrição nova com ${novo.blocks.length} blocos.`
          : `Transcrição pronta: ${novo.blocks.length} blocos.`,
      );
    } catch (error) {
      mostrarErro(error);
    } finally {
      setTarefa(undefined);
    }
  };

  const recomecarDoZero = () => {
    if (
      video &&
      window.confirm(
        `Recomeçar "${video}" do zero?\n\n` +
          "A transcrição e todas as edições deste vídeo serão apagadas: blocos, palavras-chave, layouts, " +
          "cores, sons, posições, blocos excluídos e o sorteio. Depois o vídeo é transcrito e dividido de novo.\n\n" +
          "O vídeo e os arquivos em saidas/ não são apagados. Não dá para desfazer.",
      )
    ) {
      void transcrever(true);
    }
  };

  // Tira o vídeo da lista (o arquivo vai para removidos/) e apaga a transcrição dele.
  // Devolve verdadeiro se o vídeo saiu da lista.
  const removerVideo = async (): Promise<boolean> => {
    const nome = video;
    if (
      !nome ||
      !window.confirm(
        `Remover "${nome}" da lista?\n\n` +
          "O arquivo vai para a pasta removidos/ (não é apagado) e a transcrição dele, com todas as edições, é apagada. " +
          "Os vídeos em saidas/ continuam.",
      )
    ) {
      return false;
    }
    cancelarSalvamento();
    setErro(undefined);
    // Solta o arquivo da prévia antes de movê-lo.
    playerRef.current?.pause();
    const outros = catalogo.videos.filter((outro) => outro !== nome);
    setVideo(outros[0] ?? "");
    try {
      const {movidoPara, apagouTranscricao} = await api.removerVideo(nome);
      setCatalogo(await api.catalogo());
      if (apagouTranscricao) {
        setProjeto(null);
      }
      setAviso(`"${nome}" saiu da lista (arquivo em ${movidoPara})${apagouTranscricao ? " e a transcrição dele foi apagada" : ""}.`);
      return true;
    } catch (error) {
      setVideo(nome);
      mostrarErro(error);
      return false;
    }
  };

  // Copia um vídeo para a pasta do projeto e já o seleciona. Devolve o nome final.
  const importarVideo = async (escolhido: VideoEscolhido): Promise<string | undefined> => {
    setErro(undefined);
    let substituir = false;
    if (catalogo.videos.includes(escolhido.nome)) {
      substituir = window.confirm(`Já existe um vídeo chamado ${escolhido.nome}. Substituir?`);
      if (!substituir) {
        return undefined;
      }
    }
    const progresso = (fracao?: number) =>
      setTarefa({nome: "Importar", etapa: `Copiando ${escolhido.nome}...`, fracao});
    progresso(0);
    try {
      let nome: string;
      try {
        nome = await escolhido.importar(substituir, progresso);
      } catch (error) {
        // O arquivo pode ter aparecido na pasta depois que a lista foi lida.
        if (!(error instanceof ErroArquivoExiste) || !window.confirm(`${error.message} Substituir?`)) {
          throw error;
        }
        nome = await escolhido.importar(true, progresso);
      }
      setCatalogo(await api.catalogo());
      setVideo(nome);
      setAviso(`Vídeo importado: ${nome}`);
      return nome;
    } catch (error) {
      mostrarErro(error);
      return undefined;
    } finally {
      setTarefa(undefined);
    }
  };

  const escolherEImportar = async (opcoes?: {galeria?: boolean}): Promise<string | undefined> => {
    const escolhido = await plataforma.escolherVideo(opcoes);
    return escolhido ? importarVideo(escolhido) : undefined;
  };

  const exportar = async () => {
    if (!projetoDoVideo) {
      return;
    }
    setErro(undefined);
    setAviso(undefined);
    setExportado(undefined);
    setTarefa({nome: "Exportar", etapa: "Salvando..."});
    try {
      await salvar(projetoDoVideo, true);
      const {caminho} = await executarTarefa<{caminho: string}>(
        "/api/exportar",
        {},
        (andamento) => setTarefa({nome: "Exportar", ...andamento}),
      );
      setExportado({nome: nomeDoArquivo(caminho), caminho});
    } catch (error) {
      mostrarErro(error);
    } finally {
      setTarefa(undefined);
    }
  };

  const mudarEfeitos = (mudanca: Partial<ConfigEfeitos>) =>
    atualizarProjeto({efeitos: {...configEfeitos, ...mudanca}});

  // Botão ▶ de um bloco: toca o som com o volume dos efeitos.
  const ouvirSom = (arquivo: string) => {
    ouvindo.current?.pause();
    const audio = new Audio(api.somUrl(arquivo));
    audio.volume = configEfeitos.volume / 100;
    ouvindo.current = audio;
    audio.play().catch(mostrarErro);
  };

  // Outro vídeo: nenhum bloco selecionado e histórico de desfazer vazio.
  useEffect(() => {
    setBlocoSelecionado(-1);
    limparHistorico();
  }, [video]);

  // Galeria: estilo com todos os pacotes, carregado ao abrir (e de novo depois de recarregar).
  useEffect(() => {
    if (galeriaAberta && !estiloGaleria && catalogo.pacotes.length > 0) {
      api.estilo(PACOTE_MISTO, estilo?.paleta).then(setEstiloGaleria).catch(mostrarErro);
    }
  }, [galeriaAberta, estiloGaleria, catalogo.pacotes.length, estilo?.paleta]);

  // Bloco escolhido na lista, com o layout no formato da galeria ("d/d4").
  const selecionado: BlocoSelecionado | undefined = useMemo(() => {
    const bloco = blocos[blocoSelecionado];
    if (!bloco || !estilo) {
      return undefined;
    }
    const layout = estilo.pacote === PACOTE_MISTO ? bloco.template : `${estilo.pacote}/${bloco.template}`;
    return {indice: blocoSelecionado, bloco, seguinte: blocos[blocoSelecionado + 1], layout};
  }, [blocos, blocoSelecionado, estilo]);

  const irParaBloco = (indice: number) => {
    setBlocoSelecionado(indice);
    const timing = timeline[indice];
    if (timing && videoInfo) {
      playerRef.current?.pause();
      // Primeiro quadro com o bloco já na tela (arredondar para baixo cairia no anterior).
      playerRef.current?.seekTo(Math.ceil((timing.showMs / 1000) * videoInfo.fps));
    }
  };

  // Clique numa miniatura: o layout vai para o bloco selecionado como escolha manual.
  // Com um pacote só, um layout de outro pacote passa o vídeo para o modo misto sem
  // mudar os layouts que já estão nos blocos.
  const aplicarLayoutDaGaleria = (chave: string) => {
    if (!projetoDoVideo || !estilo || !estiloGaleria || !selecionado) {
      return;
    }
    const indice = selecionado.indice;
    const [pacote, nome] = chave.split("/");
    if (estilo.pacote === PACOTE_MISTO) {
      editarBlocos((atuais) => setLayout(atuais, indice, chave, estilo));
    } else if (pacote === estilo.pacote) {
      editarBlocos((atuais) => setLayout(atuais, indice, nome, estilo));
    } else {
      const misto: Estilo = {...estiloGaleria, paleta: estilo.paleta, palette: estilo.palette};
      atualizarProjeto(
        {pacote: PACOTE_MISTO, blocks: setLayout(blocksToMixed(blocos, estilo.pacote), indice, chave, misto)},
        true,
      );
      setEstilo(misto);
      limparHistorico();
      setAviso(
        `O vídeo passou para o modo misto para usar ${chave} no bloco ${indice + 1}. Os outros blocos continuam com os mesmos layouts.`,
      );
    }
    irParaBloco(indice);
  };

  // Acompanha o bloco que está na tela enquanto a prévia toca.
  const aoMudarQuadro = useCallback(
    (frame: number) => {
      if (!videoInfo) {
        return;
      }
      const indice = findActiveBlockIndex(timeline, (frame / videoInfo.fps) * 1000);
      setBlocoAtivo((atual) => (atual === indice ? atual : indice));
    },
    [timeline, videoInfo],
  );

  // Edições de um bloco (lista, ajustes do bloco, folha do celular). Só valem com o
  // vídeo transcrito.
  const blocoAcoes = {
    texto: (b: number, p: number, texto: string) => editarBlocos((atuais) => setWordText(atuais, b, p, texto)),
    palavraChave: (b: number, p: number) => {
      if (!estilo) return;
      editarBlocos((atuais) => setKeyword(atuais, b, p, estilo));
      irParaBloco(b);
    },
    excluirPalavra: (b: number, p: number) => estilo && aplicarExclusao(removeWord(blocos, b, p, estilo)),
    dividir: (b: number, p: number) => estilo && editarBlocos((atuais) => splitBefore(atuais, b, p, estilo)),
    layout: (b: number, nome: string) => estilo && editarBlocos((atuais) => setLayout(atuais, b, nome, estilo)),
    cor: (b: number, paleta: string | undefined) => editarBlocos((atuais) => setBlockPalette(atuais, b, paleta)),
    som: (b: number, som: string | undefined) => editarBlocos((atuais) => setBlockSound(atuais, b, som)),
    posicaoGeral: (b: number) => editarBlocos((atuais) => setBlockPosition(atuais, b, undefined)),
    posicaoDoBloco: (b: number, posicao: Posicao) => atualizarProjeto({blocks: setBlockPosition(blocos, b, posicao)}),
    juntar: (b: number) => estilo && editarBlocos((atuais) => mergeWithNext(atuais, b, estilo)),
    revisar: (b: number) => editarBlocos((atuais) => toggleReview(atuais, b)),
    excluirBloco: (b: number) => estilo && aplicarExclusao(excludeBlock(blocos, b, estilo)),
  };

  // Começo de um ajuste contínuo (arrasto, controle deslizante): entra no histórico uma vez.
  const inicioDeAjuste = () => projetoDoVideo && guardarNoHistorico(projetoDoVideo);
  const limparCores = () => editarBlocos(clearBlockPalettes);
  const restaurarPosicoes = () => editarBlocos(clearBlockPositions);
  const refazerTodosOsLayouts = () => {
    if (!projetoDoVideo || !estilo) {
      return;
    }
    const semente = projetoDoVideo.semente ?? novaSemente();
    editarProjeto({semente, blocks: refazerLayouts(estilo, blocos, semente)});
  };

  // A prévia está na tela (o Player existe).
  const previaAtiva = Boolean(video && videoInfo && estilo);
  const podeExportar = Boolean(projetoDoVideo && estilo);
  const temBlocoSelecionado = blocoSelecionado >= 0 && blocoSelecionado < blocos.length;

  return {
    catalogo,
    video,
    setVideo,
    videoInfo,
    projetoDoVideo,
    // Vídeo do transcricao.json (o único transcrito) e quantos blocos ele tem.
    projetoSalvo: projeto ? {video: projeto.source, blocos: projeto.blocks.length} : undefined,
    estilo,
    tarefa,
    ocupado: Boolean(tarefa),
    erro,
    setErro,
    mostrarErro,
    avisos,
    fecharAviso,
    salvamento,
    blocoAtivo,
    exportado,
    setExportado,
    sons,
    setGaleriaAberta,
    estiloGaleria,
    blocoSelecionado,
    setBlocoSelecionado,
    selecionado,
    playerRef,
    blocos,
    sincroniaMs,
    excluidos,
    cortesMs,
    timeline,
    configEfeitos,
    efeitos,
    posicaoGeral,
    atualizarProjeto,
    editarProjeto,
    guardarNoHistorico,
    inicioDeAjuste,
    podeDesfazer,
    podeRefazer,
    desfazer,
    refazer,
    restaurarExcluido,
    moverLegenda,
    setMoverLegenda,
    soEsteBloco,
    marcarSoEsteBloco,
    blocoQueMove,
    posicaoQueMove,
    moverPara,
    moverPosicao,
    trocarPacote,
    sortearDeNovo,
    trocarPaleta,
    recarregarTemplates,
    transcrever,
    recomecarDoZero,
    removerVideo,
    importarVideo,
    escolherEImportar,
    exportar,
    mudarEfeitos,
    ouvirSom,
    aplicarLayoutDaGaleria,
    irParaBloco,
    aoMudarQuadro,
    blocoAcoes,
    limparCores,
    restaurarPosicoes,
    refazerTodosOsLayouts,
    previaAtiva,
    podeExportar,
    temBlocoSelecionado,
    fps: videoInfo?.fps ?? 30,
    durationInFrames: videoInfo?.durationInFrames ?? 1,
  };
};
