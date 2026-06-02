/**
 * CommandExecutor - 命令执行抽象接口
 *
 * 依赖倒置：odysseus-core 定义接口，odysseus-app 提供真实实现。
 * Cerebellum 的验证管线通过此接口执行 guard 和 metric 命令，
 * 保持核心包的零依赖约束。
 */

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

/**
 * 命令执行器接口
 *
 * 实现：odysseus-app 中的 ShellExecutor（基于 child_process）
 * 测试：可注入 mock 实现
 */
export interface CommandExecutor {
  /**
   * 执行 shell 命令并返回结果
   *
   * @param command 要执行的命令字符串
   * @param timeout 超时毫秒数（默认 120000）
   * @param cwd 工作目录（默认项目根目录）
   */
  execute(command: string, timeout?: number, cwd?: string): Promise<CommandResult>;
}
