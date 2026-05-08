#!/usr/bin/env bash
#
# Killer Agent — Docker 一键启动
#
# 用法:
#   ./start.sh                        # 体验模式 (无需 Key)
#   ./start.sh YOUR_API_KEY           # 用 Key 启动 (自动识别服务商)
#   ./start.sh --init                 # 交互式配置
#
set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

echo ""
echo "  ${BOLD}${CYAN}🧠 Killer Agent — 启动${RESET}"
echo ""

# 检查 Docker
if ! command -v docker &>/dev/null; then
  echo "  ${YELLOW}未检测到 Docker。${RESET}"
  echo "  请先安装: ${CYAN}https://docs.docker.com/get-docker/${RESET}"
  echo ""
  echo "  或使用 Node.js 直接启动:"
  echo "    ${CYAN}node killer.mjs${RESET}"
  echo ""
  exit 1
fi

# 检查 Docker Compose
if ! docker compose version &>/dev/null; then
  echo "  ${YELLOW}需要 Docker Compose v2+。${RESET}"
  echo "  请更新 Docker Desktop: ${CYAN}https://docs.docker.com/get-docker/${RESET}"
  exit 1
fi

KEY="${1:-}"

# ── 交互式配置 ──
if [ "$KEY" = "--init" ]; then
  echo "  启动配置向导..."
  docker compose run --rm killer node packages/killer-app/dist/main.js --init
  exit 0
fi

# ── 无 Key → 体验模式 ──
if [ -z "$KEY" ]; then
  # 检查 .env 文件
  if [ -f ".env" ]; then
    echo "  ${DIM}使用 .env 配置${RESET}"
    docker compose up -d --build
  else
    echo "  ${YELLOW}体验模式${RESET} — 粘贴 Key 即可连接真实 AI:"
    echo "    ${CYAN}./start.sh YOUR_API_KEY${RESET}"
    echo ""
    KILLER_LLM_PROVIDER=mock docker compose up -d --build
  fi
else
  # ── 有 Key → 自动识别 ──
  # 通过 Key 前缀识别服务商
  PROVIDER=""
  ENV_VAR="KILLER_API_KEY"
  if echo "$KEY" | grep -q "^sk-ant-"; then
    PROVIDER="anthropic"
    ENV_VAR="ANTHROPIC_API_KEY"
  elif echo "$KEY" | grep -q "^sk-or-"; then
    PROVIDER="openrouter"
    ENV_VAR="OPENROUTER_API_KEY"
  elif echo "$KEY" | grep -q "^AIza"; then
    PROVIDER="gemini"
    ENV_VAR="GOOGLE_API_KEY"
  elif echo "$KEY" | grep -q "^sk-cp-"; then
    PROVIDER="minimax"
    ENV_VAR="MINIMAX_API_KEY"
  elif echo "$KEY" | grep -q "^sk-kimi"; then
    PROVIDER="moonshot"
    ENV_VAR="MOONSHOT_API_KEY"
  elif echo "$KEY" | grep -q "^sk-"; then
    PROVIDER="deepseek"
    ENV_VAR="DEEPSEEK_API_KEY"
  elif echo "$KEY" | grep -q "^eyJ"; then
    PROVIDER="glm"
    ENV_VAR="GLM_API_KEY"
  fi

  if [ -n "$PROVIDER" ]; then
    echo "  ${GREEN}✓${RESET} 检测到 ${PROVIDER} Key"
  else
    # 默认用 openai-compatible 让系统自动尝试
    PROVIDER="deepseek"
    ENV_VAR="DEEPSEEK_API_KEY"
    echo "  ${DIM}无法自动识别，使用 DeepSeek 协议 (可通过 --init 修改)${RESET}"
  fi

  KILLER_LLM_PROVIDER="$PROVIDER" "$ENV_VAR"="$KEY" docker compose up -d --build
fi

echo ""
echo "  ${GREEN}${BOLD}✓ 已启动！${RESET}"
echo ""
echo "  API 地址: ${CYAN}http://localhost:3000${RESET}"
echo "  健康检查: ${CYAN}curl http://localhost:3000/health${RESET}"
echo "  查看日志: ${CYAN}docker compose logs -f${RESET}"
echo "  停止服务: ${CYAN}docker compose down${RESET}"
echo ""
