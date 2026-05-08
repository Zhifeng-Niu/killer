/**
 * Synapse - 突触协议实现
 *
 * Cell 间通信（Gaggle++）
 */

import type {
  CellId,
  CellType,
  SynapseMessage,
  MessageType,
  NegotiationProposal,
  NegotiationResult,
  NegotiationType,
  MarketListing,
  MarketTransaction,
} from './types.js';

/**
 * Cell 实体
 */
export interface Cell {
  id: CellId;
  config: CellConfig;
  status: CellRuntimeStatus;
}

/**
 * Cell 配置
 */
export interface CellConfig {
  name: string;
  type: CellType;
  capabilities: string[];
  maxLoad: number;
}

/**
 * Cell 运行状态
 */
export interface CellRuntimeStatus {
  alive: boolean;
  currentLoad: number;
  lastHeartbeat: number;
}

/**
 * 消息处理器
 */
type MessageHandler = (message: SynapseMessage) => void;

/**
 * 订阅信息
 */
interface Subscription {
  cellId: CellId;
  messageType: MessageType;
  handler: MessageHandler;
}

/**
 * 协商会话
 */
interface NegotiationSession {
  proposal: NegotiationProposal;
  participants: CellId[];
  responses: Map<string, NegotiationResult>;
  deadline: number;
}

/**
 * 突触协议实现
 *
 * 基于 EventEmitter 的消息传递系统
 */
export class SynapseProtocol {
  private cells: Map<string, Cell> = new Map();
  private messageQueue: Map<string, SynapseMessage[]> = new Map();
  private subscriptions: Set<Subscription> = new Set();
  private negotiationSessions: Map<string, NegotiationSession> = new Map();
  private marketListings: Map<string, MarketListing> = new Map();
  private transactions: MarketTransaction[] = [];
  private connections: Set<string> = new Set();

  /**
   * 注册 Cell
   */
  registerCell(cellId: CellId, config: Partial<CellConfig> = {}): void {
    const defaultConfig: CellConfig = {
      name: `cell-${cellId.id}`,
      type: cellId.type,
      capabilities: [],
      maxLoad: 10,
    };

    const cell: Cell = {
      id: cellId,
      config: { ...defaultConfig, ...config },
      status: {
        alive: true,
        currentLoad: 0,
        lastHeartbeat: Date.now(),
      },
    };

    this.cells.set(this.cellIdToString(cellId), cell);
    this.messageQueue.set(this.cellIdToString(cellId), []);
  }

  /**
   * 注销 Cell
   */
  unregisterCell(cellId: CellId): void {
    const key = this.cellIdToString(cellId);
    this.cells.delete(key);
    this.messageQueue.delete(key);

    // 清理订阅
    this.subscriptions = new Set(
      Array.from(this.subscriptions).filter(
        (sub) => this.cellIdToString(sub.cellId) !== key,
      ),
    );

    // 清理连接
    this.connections = new Set(
      Array.from(this.connections).filter((conn) => !conn.includes(key)),
    );
  }

  /**
   * 广播消息给所有 Cell
   */
  broadcast(from: string, message: Omit<SynapseMessage, 'from' | 'to'>): void {
    const fromCell = this.findCellById(from);
    if (!fromCell) {
      throw new Error(`Sender cell ${from} not found`);
    }

    const fullMessage: SynapseMessage = {
      ...message,
      from: fromCell.id,
      to: [], // 广播目标
    };

    // 发送给所有订阅该消息类型的 Cell
    for (const sub of this.subscriptions) {
      if (sub.messageType === message.type) {
        this.deliverMessage(sub.cellId, fullMessage);
      }
    }
  }

  /**
   * 定向发送
   */
  send(from: string, to: string, message: Omit<SynapseMessage, 'from' | 'to'>): void {
    const fromCell = this.findCellById(from);
    const toCell = this.findCellById(to);

    if (!fromCell) {
      throw new Error(`Sender cell ${from} not found`);
    }
    if (!toCell) {
      throw new Error(`Receiver cell ${to} not found`);
    }

    const fullMessage: SynapseMessage = {
      ...message,
      from: fromCell.id,
      to: toCell.id,
    };

    this.deliverMessage(toCell.id, fullMessage);
  }

  /**
   * 投递消息
   */
  private deliverMessage(to: CellId, message: SynapseMessage): void {
    const key = this.cellIdToString(to);
    const queue = this.messageQueue.get(key);
    if (queue) {
      queue.push(message);

      // 触发订阅处理器
      for (const sub of this.subscriptions) {
        if (
          this.cellIdToString(sub.cellId) === key &&
          sub.messageType === message.type
        ) {
          sub.handler(message);
        }
      }
    }
  }

  /**
   * 订阅消息类型
   */
  subscribe(cellId: CellId, messageType: MessageType, handler: MessageHandler): () => void {
    const subscription: Subscription = { cellId, messageType, handler };
    this.subscriptions.add(subscription);

    // 返回取消订阅函数
    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  /**
   * 接收消息
   */
  receive(cellId: CellId): SynapseMessage[] {
    const key = this.cellIdToString(cellId);
    const queue = this.messageQueue.get(key);
    if (!queue) {
      return [];
    }

    const messages = queue.splice(0); // 取出所有消息
    return messages;
  }

  /**
   * 协商（Gaggle A2A 升级版）
   */
  async negotiate(participants: string[], topic: string): Promise<NegotiationResult> {
    const session: NegotiationSession = {
      proposal: {
        id: `neg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        proposerId: this.findCellById(participants[0])?.id ?? { id: participants[0], type: 'worker' as CellType, instance: 0 },
        targetId: this.findCellById(participants[1])?.id ?? { id: participants[1], type: 'worker' as CellType, instance: 0 },
        type: 'cooperation',
        terms: { topic },
        deadline: Date.now() + 30000, // 30 秒超时
      },
      participants: participants.map((p) => this.findCellById(p)?.id ?? { id: p, type: 'worker' as CellType, instance: 0 }),
      responses: new Map(),
      deadline: Date.now() + 30000,
    };

    this.negotiationSessions.set(session.proposal.id, session);

    // 模拟协商过程
    const accepted = Math.random() > 0.3; // 70% 接受率

    const result: NegotiationResult = {
      proposalId: session.proposal.id,
      accepted,
      terms: accepted
        ? { agreement: `Cooperation on ${topic} established` }
        : { reason: 'Terms not acceptable' },
      reasoning: accepted
        ? undefined
        : 'Participants could not reach consensus',
    };

    // 清理会话
    setTimeout(() => {
      this.negotiationSessions.delete(session.proposal.id);
    }, 1000);

    return result;
  }

  /**
   * 细胞分裂
   */
  fission(parentId: string, config: Partial<CellConfig> = {}): CellId {
    const parent = this.findCellById(parentId);
    if (!parent) {
      throw new Error(`Parent cell ${parentId} not found`);
    }

    const childId: CellId = {
      id: `${parent.id.id}-${Date.now()}`,
      type: parent.id.type,
      instance: parent.id.instance + 1,
    };

    const childConfig: CellConfig = {
      ...parent.config,
      ...config,
      name: config.name ?? `${parent.config.name}-child`,
    };

    this.registerCell(childId, childConfig);

    return childId;
  }

  /**
   * 细胞融合
   */
  fusion(cellIds: string[]): CellId {
    if (cellIds.length < 2) {
      throw new Error('At least 2 cells required for fusion');
    }

    const cells = cellIds.map((id) => this.findCellById(id)).filter(Boolean) as Cell[];

    if (cells.length !== cellIds.length) {
      throw new Error('One or more cells not found');
    }

    // 创建融合后的 Cell
    const fusedId: CellId = {
      id: `fused-${Date.now()}`,
      type: cells[0].id.type, // 使用第一个 Cell 的类型
      instance: 0,
    };

    const fusedConfig: CellConfig = {
      name: `fused-${cells.map((c) => c.config.name).join('-')}`,
      type: cells[0].id.type,
      capabilities: [...new Set(cells.flatMap((c) => c.config.capabilities))],
      maxLoad: cells.reduce((sum, c) => sum + c.config.maxLoad, 0),
    };

    this.registerCell(fusedId, fusedConfig);

    // 移除原 Cell
    for (const cellId of cellIds) {
      this.unregisterCell(this.findCellById(cellId)!.id);
    }

    return fusedId;
  }

  /**
   * 发布能力到市场
   */
  listCapability(listing: Omit<MarketListing, 'id'>): string {
    const id = `listing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fullListing: MarketListing = { ...listing, id };
    this.marketListings.set(id, fullListing);
    return id;
  }

  /**
   * 搜索能力
   */
  searchCapabilities(query: string): MarketListing[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.marketListings.values()).filter(
      (l) =>
        l.skillId.toLowerCase().includes(lowerQuery) ||
        l.skillId.toLowerCase().includes(lowerQuery),
    );
  }

  /**
   * 执行交易
   */
  executeTransaction(listingId: string, buyerId: CellId): MarketTransaction {
    const listing = this.marketListings.get(listingId);
    if (!listing) {
      throw new Error(`Listing ${listingId} not found`);
    }

    const transaction: MarketTransaction = {
      id: `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      listingId,
      buyerId,
      sellerId: listing.providerId,
      price: listing.price,
      timestamp: Date.now(),
      completed: true,
    };

    this.transactions.push(transaction);

    return transaction;
  }

  /**
   * 建立连接
   */
  connect(cell1Id: CellId, cell2Id: CellId): void {
    const key1 = this.cellIdToString(cell1Id);
    const key2 = this.cellIdToString(cell2Id);
    const connectionKey = [key1, key2].sort().join('<->');

    this.connections.add(connectionKey);
  }

  /**
   * 断开连接
   */
  disconnect(cell1Id: CellId, cell2Id: CellId): void {
    const key1 = this.cellIdToString(cell1Id);
    const key2 = this.cellIdToString(cell2Id);
    const connectionKey = [key1, key2].sort().join('<->');

    this.connections.delete(connectionKey);
  }

  /**
   * 获取网络拓扑
   */
  getTopology(): { nodes: CellId[]; edges: [CellId, CellId][] } {
    const nodes = Array.from(this.cells.values()).map((c) => c.id);
    const edges: [CellId, CellId][] = [];

    for (const conn of this.connections) {
      const [id1, id2] = conn.split('<->');
      const cell1 = this.cells.get(id1);
      const cell2 = this.cells.get(id2);
      if (cell1 && cell2) {
        edges.push([cell1.id, cell2.id]);
      }
    }

    return { nodes, edges };
  }

  /**
   * 获取 Cell 状态
   */
  getCellStatus(cellId: CellId): CellRuntimeStatus | undefined {
    const cell = this.cells.get(this.cellIdToString(cellId));
    return cell?.status;
  }

  /**
   * 心跳更新
   */
  heartbeat(cellId: CellId): void {
    const cell = this.cells.get(this.cellIdToString(cellId));
    if (cell) {
      cell.status.lastHeartbeat = Date.now();
      cell.status.alive = true;
    }
  }

  /**
   * 发现 Cell
   */
  discoverCells(type?: CellType): CellId[] {
    let cells = Array.from(this.cells.values());

    if (type) {
      cells = cells.filter((c) => c.id.type === type);
    }

    return cells.map((c) => c.id);
  }

  /**
   * CellId 转字符串
   */
  private cellIdToString(cellId: CellId): string {
    return `${cellId.type}-${cellId.id}-${cellId.instance}`;
  }

  /**
   * 通过 ID 查找 Cell
   */
  private findCellById(id: string): Cell | undefined {
    for (const cell of this.cells.values()) {
      if (cell.id.id === id) {
        return cell;
      }
    }
    return undefined;
  }

  /**
   * 获取所有 Cell
   */
  getAllCells(): Cell[] {
    return Array.from(this.cells.values());
  }

  /**
   * 获取所有交易
   */
  getTransactions(): MarketTransaction[] {
    return [...this.transactions];
  }

  /**
   * 清空所有数据
   */
  clear(): void {
    this.cells.clear();
    this.messageQueue.clear();
    this.subscriptions.clear();
    this.negotiationSessions.clear();
    this.marketListings.clear();
    this.transactions = [];
    this.connections.clear();
  }
}
