import type {Andamento} from "./api";
import {MenuDaConta} from "./MenuDaConta";

export type Salvamento = "salvo" | "pendente" | "salvando" | "erro";

const TEXTO_DO_SALVAMENTO: Record<Salvamento, string> = {
  salvo: "salvo",
  pendente: "alterações a salvar",
  salvando: "salvando…",
  erro: "erro ao salvar",
};

type Props = {
  video: string;
  temProjeto: boolean;
  salvamento: Salvamento;
  ocupado: boolean;
  podeExportar: boolean;
  tarefa?: {nome: string} & Andamento;
  // Desfazer/refazer (também Ctrl+Z / Ctrl+Y).
  podeDesfazer: boolean;
  podeRefazer: boolean;
  onDesfazer: () => void;
  onRefazer: () => void;
  onTranscrever: () => void;
  onExportar: () => void;
  // Vídeo que acabou de ser exportado: Baixar / Abrir pasta.
  exportado?: string;
  onBaixar: () => void;
  onAbrirPasta: () => void;
  onFecharExportado: () => void;
  // Janelas estreitas: recolher os painéis laterais.
  esqAberto: boolean;
  dirAberto: boolean;
  onAlternarEsq: () => void;
  onAlternarDir: () => void;
};

export const BarraTopo: React.FC<Props> = ({
  video,
  temProjeto,
  salvamento,
  ocupado,
  podeExportar,
  tarefa,
  podeDesfazer,
  podeRefazer,
  onDesfazer,
  onRefazer,
  onTranscrever,
  onExportar,
  exportado,
  onBaixar,
  onAbrirPasta,
  onFecharExportado,
  esqAberto,
  dirAberto,
  onAlternarEsq,
  onAlternarDir,
}) => (
  <header className="barra">
    <button
      type="button"
      className="ic so-estreita"
      aria-pressed={esqAberto}
      aria-label={esqAberto ? "Recolher o painel da esquerda" : "Mostrar o painel da esquerda"}
      title={esqAberto ? "Recolher o painel da esquerda" : "Mostrar o painel da esquerda"}
      onClick={onAlternarEsq}
    >
      ◧
    </button>
    <div className="marca">
      <i aria-hidden="true" />
      Ascent Legendas
    </div>
    <div className="projeto" aria-live="polite">
      {video ? (
        <>
          <b>{video}</b>
          {temProjeto ? (
            <span className={salvamento === "erro" ? "projeto-erro" : undefined}> · {TEXTO_DO_SALVAMENTO[salvamento]}</span>
          ) : (
            " · não transcrito"
          )}
        </>
      ) : (
        "Nenhum vídeo aberto"
      )}
    </div>
    <div className="cresce" />

    {tarefa ? (
      <div className="andamento" aria-live="polite">
        <span className="andamento-texto">
          {tarefa.nome}: {tarefa.etapa}
          {tarefa.fracao !== undefined ? ` ${Math.round(tarefa.fracao * 100)}%` : ""}
        </span>
        <progress max={1} value={tarefa.fracao} />
      </div>
    ) : null}

    <button type="button" className="ic" disabled={!podeDesfazer} onClick={onDesfazer} title="Desfazer (Ctrl+Z)" aria-label="Desfazer">
      ↶
    </button>
    <button type="button" className="ic" disabled={!podeRefazer} onClick={onRefazer} title="Refazer (Ctrl+Y)" aria-label="Refazer">
      ↷
    </button>
    <button type="button" className="bt" disabled={ocupado || !video} onClick={onTranscrever}>
      Transcrever
    </button>
    <div className="exportar">
      <button type="button" className="bt primario" disabled={ocupado || !podeExportar} onClick={onExportar}>
        Exportar
      </button>
      {exportado ? (
        <div className="exportado" role="status">
          <span>
            Vídeo exportado: <strong>{exportado}</strong>
          </span>
          <span className="exportado-botoes">
            <button type="button" className="bt primario" onClick={onBaixar}>
              Baixar
            </button>
            <button type="button" className="bt" onClick={onAbrirPasta}>
              Abrir pasta
            </button>
            <button type="button" className="bt" onClick={onFecharExportado}>
              Fechar
            </button>
          </span>
        </div>
      ) : null}
    </div>
    <MenuDaConta ocupado={ocupado} />
    <button
      type="button"
      className="ic so-estreita"
      aria-pressed={dirAberto}
      aria-label={dirAberto ? "Recolher o painel da direita" : "Mostrar o painel da direita"}
      title={dirAberto ? "Recolher o painel da direita" : "Mostrar o painel da direita"}
      onClick={onAlternarDir}
    >
      ◨
    </button>
  </header>
);
