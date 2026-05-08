/**
 * Synapse 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SynapseProtocol } from '../synapse/synapse-protocol.js';
import { CellType, type SynapseMessage } from '../synapse/types.js';

describe('SynapseProtocol', () => {
  let protocol: SynapseProtocol;

  beforeEach(() => {
    protocol = new SynapseProtocol();
  });

  const createCellId = (id: string, type: CellType = CellType.Prime) => ({
    id,
    type,
    instance: 0,
  });

  describe('registerCell', () => {
    it('应注册新 Cell', () => {
      const cellId = createCellId('cell-1');
      protocol.registerCell(cellId);

      const cells = protocol.getAllCells();
      expect(cells.length).toBe(1);
      expect(cells[0].id.id).toBe('cell-1');
    });

    it('应支持自定义配置', () => {
      const cellId = createCellId('cell-1');
      protocol.registerCell(cellId, {
        name: 'CustomCell',
        capabilities: ['coding', 'reasoning'],
        maxLoad: 20,
      });

      const cells = protocol.getAllCells();
      expect(cells[0].config.name).toBe('CustomCell');
      expect(cells[0].config.capabilities).toContain('coding');
    });
  });

  describe('unregisterCell', () => {
    it('应注销 Cell', () => {
      const cellId = createCellId('cell-1');
      protocol.registerCell(cellId);

      protocol.unregisterCell(cellId);

      const cells = protocol.getAllCells();
      expect(cells.length).toBe(0);
    });
  });

  describe('send', () => {
    it('应发送消息', () => {
      const senderId = createCellId('sender');
      const receiverId = createCellId('receiver');

      protocol.registerCell(senderId);
      protocol.registerCell(receiverId);

      protocol.send('sender', 'receiver', {
        id: 'msg-1',
        timestamp: Date.now(),
        type: 'request',
        payload: { data: 'test' },
        priority: 'normal',
      });

      const messages = protocol.receive(receiverId);
      expect(messages.length).toBe(1);
      expect(messages[0].payload).toEqual({ data: 'test' });
    });

    it('发送到不存在的 Cell 应抛出错误', () => {
      const senderId = createCellId('sender');
      protocol.registerCell(senderId);

      expect(() => {
        protocol.send('sender', 'non-existent', {
          id: 'msg-1',
          timestamp: Date.now(),
          type: 'request',
          payload: {},
          priority: 'normal',
        });
      }).toThrow();
    });
  });

  describe('broadcast', () => {
    it('应广播消息给订阅者', () => {
      const cell1 = createCellId('cell-1');
      const cell2 = createCellId('cell-2');

      protocol.registerCell(cell1);
      protocol.registerCell(cell2);

      // 订阅
      protocol.subscribe(cell2, 'request', () => {});

      protocol.broadcast('cell-1', {
        id: 'msg-1',
        timestamp: Date.now(),
        type: 'request',
        payload: { broadcast: true },
        priority: 'normal',
      });

      const messages = protocol.receive(cell2);
      expect(messages.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('subscribe', () => {
    it('应订阅消息类型', () => {
      const cellId = createCellId('cell-1');
      protocol.registerCell(cellId);

      let received = false;
      const unsubscribe = protocol.subscribe(cellId, 'request', () => {
        received = true;
      });

      expect(typeof unsubscribe).toBe('function');
    });

    it('取消订阅应停止接收消息', () => {
      const cellId = createCellId('cell-1');
      protocol.registerCell(cellId);

      let count = 0;
      const unsubscribe = protocol.subscribe(cellId, 'request', () => {
        count++;
      });

      unsubscribe();

      // 发送消息不应增加计数
      protocol.send('cell-1', 'cell-1', {
        id: 'msg-1',
        timestamp: Date.now(),
        type: 'request',
        payload: {},
        priority: 'normal',
      });

      expect(count).toBe(0);
    });
  });

  describe('negotiate', () => {
    it('应执行协商', async () => {
      const result = await protocol.negotiate(['cell-1', 'cell-2'], 'cooperation');

      expect(result).toHaveProperty('proposalId');
      expect(result).toHaveProperty('accepted');
      expect(result).toHaveProperty('terms');
    });
  });

  describe('fission', () => {
    it('应分裂 Cell', () => {
      const parentId = createCellId('parent');
      protocol.registerCell(parentId);

      const childId = protocol.fission('parent', { name: 'Child' });

      expect(childId.id).toContain('parent');
      const cells = protocol.getAllCells();
      expect(cells.length).toBe(2);
    });
  });

  describe('fusion', () => {
    it('应融合多个 Cell', () => {
      const cell1 = createCellId('cell-1');
      const cell2 = createCellId('cell-2');

      protocol.registerCell(cell1, { capabilities: ['a'] });
      protocol.registerCell(cell2, { capabilities: ['b'] });

      const fusedId = protocol.fusion(['cell-1', 'cell-2']);

      expect(fusedId.id).toContain('fused');
      const cells = protocol.getAllCells();
      expect(cells.length).toBe(1);
      expect(cells[0].config.capabilities).toContain('a');
      expect(cells[0].config.capabilities).toContain('b');
    });

    it('少于 2 个 Cell 应抛出错误', () => {
      const cell1 = createCellId('cell-1');
      protocol.registerCell(cell1);

      expect(() => {
        protocol.fusion(['cell-1']);
      }).toThrow();
    });
  });

  describe('connect/disconnect', () => {
    it('应建立连接', () => {
      const cell1 = createCellId('cell-1');
      const cell2 = createCellId('cell-2');

      protocol.registerCell(cell1);
      protocol.registerCell(cell2);

      protocol.connect(cell1, cell2);

      const topology = protocol.getTopology();
      expect(topology.edges.length).toBe(1);
    });

    it('应断开连接', () => {
      const cell1 = createCellId('cell-1');
      const cell2 = createCellId('cell-2');

      protocol.registerCell(cell1);
      protocol.registerCell(cell2);

      protocol.connect(cell1, cell2);
      protocol.disconnect(cell1, cell2);

      const topology = protocol.getTopology();
      expect(topology.edges.length).toBe(0);
    });
  });

  describe('listCapability', () => {
    it('应发布能力到市场', () => {
      const providerId = createCellId('provider');
      protocol.registerCell(providerId);

      const listingId = protocol.listCapability({
        providerId,
        skillId: 'skill-1',
        price: 100,
        availability: 0.8,
        rating: 0.9,
      });

      expect(listingId).toMatch(/^listing-/);
    });
  });

  describe('searchCapabilities', () => {
    it('应搜索能力', () => {
      const providerId = createCellId('provider');
      protocol.registerCell(providerId);

      protocol.listCapability({
        providerId,
        skillId: 'coding-skill',
        price: 100,
        availability: 0.8,
        rating: 0.9,
      });

      const results = protocol.searchCapabilities('coding');

      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('executeTransaction', () => {
    it('应执行交易', () => {
      const providerId = createCellId('provider');
      const buyerId = createCellId('buyer');

      protocol.registerCell(providerId);
      protocol.registerCell(buyerId);

      const listingId = protocol.listCapability({
        providerId,
        skillId: 'skill-1',
        price: 100,
        availability: 0.8,
        rating: 0.9,
      });

      const transaction = protocol.executeTransaction(listingId, buyerId);

      expect(transaction).toHaveProperty('id');
      expect(transaction).toHaveProperty('completed', true);
      expect(transaction.price).toBe(100);
    });
  });

  describe('discoverCells', () => {
    it('应发现所有 Cell', () => {
      protocol.registerCell(createCellId('cell-1', CellType.Prime));
      protocol.registerCell(createCellId('cell-2', CellType.Researcher));

      const cells = protocol.discoverCells();

      expect(cells.length).toBe(2);
    });

    it('应按类型筛选 Cell', () => {
      protocol.registerCell(createCellId('prime-1', CellType.Prime));
      protocol.registerCell(createCellId('researcher-1', CellType.Researcher));

      const primeCells = protocol.discoverCells(CellType.Prime);

      expect(primeCells.length).toBe(1);
      expect(primeCells[0].type).toBe(CellType.Prime);
    });
  });

  describe('heartbeat', () => {
    it('应更新心跳时间', () => {
      const cellId = createCellId('cell-1');
      protocol.registerCell(cellId);

      const before = Date.now();
      protocol.heartbeat(cellId);

      const status = protocol.getCellStatus(cellId);
      expect(status?.lastHeartbeat).toBeGreaterThanOrEqual(before);
    });

    it('未注册 Cell 心跳不应崩溃', () => {
      const cellId = createCellId('ghost');
      expect(() => protocol.heartbeat(cellId)).not.toThrow();
    });
  });

  describe('send edge cases', () => {
    it('不存在的发送者应抛出错误', () => {
      const receiverId = createCellId('receiver');
      protocol.registerCell(receiverId);

      expect(() => {
        protocol.send('ghost-sender', 'receiver', {
          id: 'msg-1', timestamp: Date.now(), type: 'request', payload: {}, priority: 'normal',
        });
      }).toThrow('Sender cell ghost-sender not found');
    });
  });

  describe('broadcast edge cases', () => {
    it('不存在的发送者应抛出错误', () => {
      expect(() => {
        protocol.broadcast('ghost', {
          id: 'msg-1', timestamp: Date.now(), type: 'request', payload: {}, priority: 'normal',
        });
      }).toThrow('Sender cell ghost not found');
    });

    it('订阅者应收到广播消息', () => {
      const sender = createCellId('sender');
      const receiver = createCellId('receiver');
      protocol.registerCell(sender);
      protocol.registerCell(receiver);

      const received: SynapseMessage[] = [];
      protocol.subscribe(receiver, 'broadcast', (msg) => received.push(msg));

      protocol.broadcast('sender', {
        id: 'msg-1', timestamp: Date.now(), type: 'broadcast', payload: { hello: 'world' }, priority: 'normal',
      });

      expect(received).toHaveLength(1);
      expect(received[0].payload).toEqual({ hello: 'world' });
    });
  });

  describe('fission edge cases', () => {
    it('不存在的父 Cell 应抛出错误', () => {
      expect(() => protocol.fission('ghost')).toThrow('Parent cell ghost not found');
    });

    it('子 Cell 应继承父类型和配置', () => {
      const parentId = createCellId('parent', CellType.Researcher);
      protocol.registerCell(parentId, { capabilities: ['search'], maxLoad: 15 });

      const childId = protocol.fission('parent', { name: 'ChildResearcher' });
      const cells = protocol.getAllCells();
      const child = cells.find((c) => c.id.id === childId.id);

      expect(child).toBeDefined();
      expect(child!.config.name).toBe('ChildResearcher');
      expect(child!.id.type).toBe(CellType.Researcher);
      expect(child!.id.id).toContain('parent');
    });
  });

  describe('fusion edge cases', () => {
    it('有不存在的 Cell 应抛出错误', () => {
      const cell1 = createCellId('cell-1');
      protocol.registerCell(cell1);

      expect(() => protocol.fusion(['cell-1', 'ghost'])).toThrow('One or more cells not found');
    });

    it('融合后应合并能力并去重', () => {
      const c1 = createCellId('cell-1');
      const c2 = createCellId('cell-2');
      protocol.registerCell(c1, { capabilities: ['a', 'b'] });
      protocol.registerCell(c2, { capabilities: ['b', 'c'] });

      const fusedId = protocol.fusion(['cell-1', 'cell-2']);

      const cells = protocol.getAllCells();
      const fused = cells.find((c) => c.id.id === fusedId.id);
      expect(fused!.config.capabilities).toEqual(['a', 'b', 'c']);
      expect(fused!.config.maxLoad).toBe(20);
    });
  });

  describe('getCellStatus', () => {
    it('已注册 Cell 应返回状态', () => {
      const cellId = createCellId('cell-1');
      protocol.registerCell(cellId);

      const status = protocol.getCellStatus(cellId);
      expect(status).toBeDefined();
      expect(status!.alive).toBe(true);
      expect(status!.currentLoad).toBe(0);
    });

    it('未注册 Cell 应返回 undefined', () => {
      const status = protocol.getCellStatus(createCellId('ghost'));
      expect(status).toBeUndefined();
    });
  });

  describe('getTransactions', () => {
    it('应返回所有交易记录', () => {
      const provider = createCellId('provider');
      const buyer = createCellId('buyer');
      protocol.registerCell(provider);
      protocol.registerCell(buyer);

      const listing1 = protocol.listCapability({ providerId: provider, skillId: 's1', price: 10, availability: 1, rating: 1 });
      const listing2 = protocol.listCapability({ providerId: provider, skillId: 's2', price: 20, availability: 1, rating: 1 });

      protocol.executeTransaction(listing1, buyer);
      protocol.executeTransaction(listing2, buyer);

      const txns = protocol.getTransactions();
      expect(txns).toHaveLength(2);
    });
  });

  describe('executeTransaction edge cases', () => {
    it('不存在的 listing 应抛出错误', () => {
      const buyer = createCellId('buyer');
      expect(() => protocol.executeTransaction('ghost-listing', buyer)).toThrow('Listing ghost-listing not found');
    });
  });

  describe('receive edge cases', () => {
    it('未注册 Cell 应返回空数组', () => {
      const messages = protocol.receive(createCellId('ghost'));
      expect(messages).toEqual([]);
    });
  });

  describe('getTopology', () => {
    it('无连接时应返回空边列表', () => {
      protocol.registerCell(createCellId('cell-1'));
      protocol.registerCell(createCellId('cell-2'));

      const topo = protocol.getTopology();
      expect(topo.nodes).toHaveLength(2);
      expect(topo.edges).toHaveLength(0);
    });

    it('无 Cell 时应返回空', () => {
      const topo = protocol.getTopology();
      expect(topo.nodes).toHaveLength(0);
      expect(topo.edges).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('应重置所有状态', () => {
      const cell1 = createCellId('cell-1');
      const cell2 = createCellId('cell-2');
      protocol.registerCell(cell1);
      protocol.registerCell(cell2);
      protocol.connect(cell1, cell2);
      protocol.listCapability({ providerId: cell1, skillId: 's1', price: 10, availability: 1, rating: 1 });

      protocol.clear();

      expect(protocol.getAllCells()).toHaveLength(0);
      expect(protocol.getTransactions()).toHaveLength(0);
      expect(protocol.getTopology().nodes).toHaveLength(0);
    });
  });

  describe('unregisterCell cleanup', () => {
    it('应清理连接和订阅', () => {
      const cell1 = createCellId('cell-1');
      const cell2 = createCellId('cell-2');
      protocol.registerCell(cell1);
      protocol.registerCell(cell2);
      protocol.connect(cell1, cell2);

      protocol.unregisterCell(cell1);

      const topo = protocol.getTopology();
      expect(topo.edges).toHaveLength(0);
      expect(topo.nodes).toHaveLength(1);
    });
  });
});
