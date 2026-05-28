/**
 * Synapse - 突触协议实现
 *
 * 皮层柱间通信（Gaggle++）
 */

import type {
  ColumnId,
  ColumnRole,
  SynapseMessage,
  MessageType,
  NegotiationProposal,
  NegotiationResult,
  NegotiationType,
  MarketListing,
  MarketTransaction,
} from './types.js';

/**
 * 皮层柱实体
 */
export interface Column {
  id: ColumnId;
  config: ColumnConfig;
  status: ColumnRuntimeStatus;
}

/**
 * 皮层柱配置
 */
export interface ColumnConfig {
  name: string;
  type: ColumnRole;
  capabilities: string[];
  maxLoad: number;
}

/**
 * 皮层柱运行状态
 */
export interface ColumnRuntimeStatus {
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
  columnId: ColumnId;
  messageType: MessageType;
  handler: MessageHandler;
}

/**
 * 协商会话
 */
interface NegotiationSession {
  proposal: NegotiationProposal;
  participants: ColumnId[];
  responses: Map<string, NegotiationResult>;
  deadline: number;
}

/**
 * 突触协议实现
 *
 * 基于 EventEmitter 的消息传递系统
 */
export class SynapseProtocol {
  private columns: Map<string, Column> = new Map();
  private messageQueue: Map<string, SynapseMessage[]> = new Map();
  private subscriptions: Set<Subscription> = new Set();
  private negotiationSessions: Map<string, NegotiationSession> = new Map();
  private marketListings: Map<string, MarketListing> = new Map();
  private transactions: MarketTransaction[] = [];
  private connections: Set<string> = new Set();

  /**
   * 注册皮层柱
   */
  registerColumn(columnId: ColumnId, config: Partial<ColumnConfig> = {}): void {
    const defaultConfig: ColumnConfig = {
      name: `column-${columnId.id}`,
      type: columnId.type,
      capabilities: [],
      maxLoad: 10,
    };

    const column: Column = {
      id: columnId,
      config: { ...defaultConfig, ...config },
      status: {
        alive: true,
        currentLoad: 0,
        lastHeartbeat: Date.now(),
      },
    };

    this.columns.set(this.columnIdToString(columnId), column);
    this.messageQueue.set(this.columnIdToString(columnId), []);
  }

  /**
   * 注销皮层柱
   */
  unregisterColumn(columnId: ColumnId): void {
    const key = this.columnIdToString(columnId);
    this.columns.delete(key);
    this.messageQueue.delete(key);

    // 清理订阅
    this.subscriptions = new Set(
      Array.from(this.subscriptions).filter(
        (sub) => this.columnIdToString(sub.columnId) !== key,
      ),
    );

    // 清理连接
    this.connections = new Set(
      Array.from(this.connections).filter((conn) => !conn.includes(key)),
    );
  }

  /**
   * 广播消息给所有 Column
   */
  broadcast(from: string, message: Omit<SynapseMessage, 'from' | 'to'>): void {
    const fromCell = this.findColumnById(from);
    if (!fromCell) {
      throw new Error(`Sender column ${from} not found`);
    }

    const fullMessage: SynapseMessage = {
      ...message,
      from: fromCell.id,
      to: [], // 广播目标
    };

    // 发送给所有订阅该消息类型的 Column
    for (const sub of this.subscriptions) {
      if (sub.messageType === message.type) {
        this.deliverMessage(sub.columnId, fullMessage);
      }
    }
  }

  /**
   * 定向发送
   */
  send(from: string, to: string, message: Omit<SynapseMessage, 'from' | 'to'>): void {
    const fromCell = this.findColumnById(from);
    const toCell = this.findColumnById(to);

    if (!fromCell) {
      throw new Error(`Sender column ${from} not found`);
    }
    if (!toCell) {
      throw new Error(`Receiver column ${to} not found`);
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
  private deliverMessage(to: ColumnId, message: SynapseMessage): void {
    const key = this.columnIdToString(to);
    const queue = this.messageQueue.get(key);
    if (queue) {
      queue.push(message);

      // 触发订阅处理器
      for (const sub of this.subscriptions) {
        if (
          this.columnIdToString(sub.columnId) === key &&
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
  subscribe(columnId: ColumnId, messageType: MessageType, handler: MessageHandler): () => void {
    const subscription: Subscription = { columnId, messageType, handler };
    this.subscriptions.add(subscription);

    // 返回取消订阅函数
    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  /**
   * 接收消息
   */
  receive(columnId: ColumnId): SynapseMessage[] {
    const key = this.columnIdToString(columnId);
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
        proposerId: this.findColumnById(participants[0])?.id ?? { id: participants[0], type: 'worker' as ColumnRole, instance: 0 },
        targetId: this.findColumnById(participants[1])?.id ?? { id: participants[1], type: 'worker' as ColumnRole, instance: 0 },
        type: 'cooperation',
        terms: { topic },
        deadline: Date.now() + 30000, // 30 秒超时
      },
      participants: participants.map((p) => this.findColumnById(p)?.id ?? { id: p, type: 'worker' as ColumnRole, instance: 0 }),
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
  fission(parentId: string, config: Partial<ColumnConfig> = {}): ColumnId {
    const parent = this.findColumnById(parentId);
    if (!parent) {
      throw new Error(`Parent column ${parentId} not found`);
    }

    const childId: ColumnId = {
      id: `${parent.id.id}-${Date.now()}`,
      type: parent.id.type,
      instance: parent.id.instance + 1,
    };

    const childConfig: ColumnConfig = {
      ...parent.config,
      ...config,
      name: config.name ?? `${parent.config.name}-child`,
    };

    this.registerColumn(childId, childConfig);

    return childId;
  }

  /**
   * 细胞融合
   */
  fusion(columnIds: string[]): ColumnId {
    if (columnIds.length < 2) {
      throw new Error('At least 2 columns required for fusion');
    }

    const columns = columnIds.map((id) => this.findColumnById(id)).filter(Boolean) as Column[];

    if (columns.length !== columnIds.length) {
      throw new Error('One or more columns not found');
    }

    // 创建融合后的 Column
    const fusedId: ColumnId = {
      id: `fused-${Date.now()}`,
      type: columns[0].id.type, // 使用第一个 Column 的类型
      instance: 0,
    };

    const fusedConfig: ColumnConfig = {
      name: `fused-${columns.map((c) => c.config.name).join('-')}`,
      type: columns[0].id.type,
      capabilities: [...new Set(columns.flatMap((c) => c.config.capabilities))],
      maxLoad: columns.reduce((sum, c) => sum + c.config.maxLoad, 0),
    };

    this.registerColumn(fusedId, fusedConfig);

    // 移除原 Cell
    for (const columnId of columnIds) {
      this.unregisterColumn(this.findColumnById(columnId)!.id);
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
  executeTransaction(listingId: string, buyerId: ColumnId): MarketTransaction {
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
  connect(cell1Id: ColumnId, cell2Id: ColumnId): void {
    const key1 = this.columnIdToString(cell1Id);
    const key2 = this.columnIdToString(cell2Id);
    const connectionKey = [key1, key2].sort().join('<->');

    this.connections.add(connectionKey);
  }

  /**
   * 断开连接
   */
  disconnect(cell1Id: ColumnId, cell2Id: ColumnId): void {
    const key1 = this.columnIdToString(cell1Id);
    const key2 = this.columnIdToString(cell2Id);
    const connectionKey = [key1, key2].sort().join('<->');

    this.connections.delete(connectionKey);
  }

  /**
   * 获取网络拓扑
   */
  getTopology(): { nodes: ColumnId[]; edges: [ColumnId, ColumnId][] } {
    const nodes = Array.from(this.columns.values()).map((c) => c.id);
    const edges: [ColumnId, ColumnId][] = [];

    for (const conn of this.connections) {
      const [id1, id2] = conn.split('<->');
      const cell1 = this.columns.get(id1);
      const cell2 = this.columns.get(id2);
      if (cell1 && cell2) {
        edges.push([cell1.id, cell2.id]);
      }
    }

    return { nodes, edges };
  }

  /**
   * 获取 Cell 状态
   */
  getColumnStatus(columnId: ColumnId): ColumnRuntimeStatus | undefined {
    const column = this.columns.get(this.columnIdToString(columnId));
    return column?.status;
  }

  /**
   * 心跳更新
   */
  heartbeat(columnId: ColumnId): void {
    const column = this.columns.get(this.columnIdToString(columnId));
    if (column) {
      column.status.lastHeartbeat = Date.now();
      column.status.alive = true;
    }
  }

  /**
   * 发现 Cell
   */
  discoverCells(type?: ColumnRole): ColumnId[] {
    let columns = Array.from(this.columns.values());

    if (type) {
      columns = columns.filter((c) => c.id.type === type);
    }

    return columns.map((c) => c.id);
  }

  /**
   * ColumnId 转字符串
   */
  private columnIdToString(columnId: ColumnId): string {
    return `${columnId.type}-${columnId.id}-${columnId.instance}`;
  }

  /**
   * 通过 ID 查找 Cell
   */
  private findColumnById(id: string): Column | undefined {
    for (const column of this.columns.values()) {
      if (column.id.id === id) {
        return column;
      }
    }
    return undefined;
  }

  /**
   * 获取所有 Cell
   */
  getAllColumns(): Column[] {
    return Array.from(this.columns.values());
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
    this.columns.clear();
    this.messageQueue.clear();
    this.subscriptions.clear();
    this.negotiationSessions.clear();
    this.marketListings.clear();
    this.transactions = [];
    this.connections.clear();
  }
}
