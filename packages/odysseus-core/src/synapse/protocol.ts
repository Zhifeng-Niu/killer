/**
 * Synapse - 突触协议接口
 *
 * Cell 间通信（Gaggle++）
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
 * 突触协议接口
 */
export interface ISynapseProtocol {
  // === 消息传递 ===
  /**
   * 发送消息
   */
  send(message: SynapseMessage): Promise<void>;

  /**
   * 接收消息（非阻塞）
   */
  receive(cellId: ColumnId): Promise<SynapseMessage[]>;

  /**
   * 广播消息
   */
  broadcast(message: Omit<SynapseMessage, 'to'>): Promise<void>;

  /**
   * 订阅消息类型
   */
  subscribe(
    cellId: ColumnId,
    messageType: MessageType,
    callback: (message: SynapseMessage) => void,
  ): void;

  // === 协商 ===
  /**
   * 发起协商
   */
  initiateNegotiation(proposal: NegotiationProposal): Promise<NegotiationResult>;

  /**
   * 响应协商
   */
  respondToNegotiation(
    proposalId: string,
    response: NegotiationResult,
  ): Promise<void>;

  /**
   * 自动协商（基于策略）
   */
  autoNegotiate(
    type: NegotiationType,
    participants: ColumnId[],
  ): Promise<NegotiationResult>;

  // === Cell 管理 ===
  /**
   * 注册 Cell
   */
  registerCell(cellId: ColumnId): Promise<void>;

  /**
   * 注销 Cell
   */
  unregisterCell(cellId: ColumnId): Promise<void>;

  /**
   * 发现 Cell
   */
  discoverCells(type?: ColumnRole): Promise<ColumnId[]>;

  /**
   * 获取 Column 状态
   */
  getColumnStatus(columnId: ColumnId): Promise<ColumnStatus>;

  // === 能力市场 ===
  /**
   * 发布能力
   */
  listCapability(listing: Omit<MarketListing, 'id'>): Promise<string>;

  /**
   * 搜索能力
   */
  searchCapabilities(query: string): Promise<MarketListing[]>;

  /**
   * 执行交易
   */
  executeTransaction(
    listingId: string,
    buyerId: ColumnId,
  ): Promise<MarketTransaction>;

  // === 连接管理 ===
  /**
   * 建立连接
   */
  connect(cell1: ColumnId, cell2: ColumnId): Promise<void>;

  /**
   * 断开连接
   */
  disconnect(cell1: ColumnId, cell2: ColumnId): Promise<void>;

  /**
   * 获取网络拓扑
   */
  getTopology(): Promise<NetworkTopology>;
}

/**
 * Cell 状态
 */
export interface ColumnStatus {
  cellId: ColumnId;
  alive: boolean;
  lastHeartbeat: number;
  currentLoad: number; // [0, 1]
  capabilities: string[];
}

/**
 * 网络拓扑
 */
export interface NetworkTopology {
  nodes: ColumnId[];
  edges: [ColumnId, ColumnId][];
}
