import type { Receipt } from '../../protocol/schema';

const labels: Record<Receipt['status'], string> = {
  accepted: '排队中',
  running: '执行中',
  completed: '已完成',
  cancelled: '已取消',
  failed: '失败',
  unknown: '结果不确定',
};
export function Receipts({
  receipts,
  reportableIds,
  report,
}: {
  receipts: Receipt[];
  reportableIds: string[];
  report: (id: string) => void;
}) {
  return (
    <section className="receipts">
      <p className="muted">
        最近 {receipts.length} 条 · 取消时保留已完成步骤，重连后不重播历史动作。
      </p>
      {!receipts.length && <div className="empty">还没有动作。试着和小狐狸打个招呼。</div>}
      {receipts.map((receipt, index) => (
        <article key={`${receipt.id}-${index}`} className="receipt" data-status={receipt.status}>
          <div className="receipt-top">
            <span className={`status-pill ${receipt.status}`}>{labels[receipt.status]}</span>
            <span>
              {receipt.completed} / {receipt.total} 步
            </span>
            <time>{new Date(receipt.updatedAt).toLocaleTimeString('zh-CN')}</time>
          </div>
          <code>{receipt.id}</code>
          {receipt.detail && <p>{receipt.detail}</p>}
          {receipt.results.map((result, index) => (
            <p key={index} className="result">
              {index + 1}. {result.answer ?? result.detail ?? labels[result.outcome]}
            </p>
          ))}
          {reportableIds.includes(receipt.id) && (
            <button className="text-button" onClick={() => report(receipt.id)}>
              将此回执回传 Anelf
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
