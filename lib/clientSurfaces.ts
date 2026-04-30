export type ClientSurfaceKind = 'app' | 'web'

export type ClientSurfaceNavItem = {
  href: string
  label: string
  description: string
}

export const APP_SURFACE_NAV: ClientSurfaceNavItem[] = [
  {
    href: '/mobile',
    label: '念及',
    description: '高频语音入口',
  },
  {
    href: '/mobile/twin',
    label: '分身',
    description: '高频对话与音色入口',
  },
  {
    href: '/mobile/review',
    label: '回顾',
    description: '轻量回顾与最近确认',
  },
  {
    href: '/mobile/me',
    label: '我的',
    description: '能力状态与必要设置',
  },
]

export const WEB_WORKBENCH_MODULES: ClientSurfaceNavItem[] = [
  {
    href: '/',
    label: '语音入口',
    description: '继续用当前首页验证记录与即时回应',
  },
  {
    href: '/studio',
    label: '工作台',
    description: '整理、核对、跳转到重界面能力',
  },
  {
    href: '/twin',
    label: '分身管理',
    description: '查看分身状态、版本和长线配置',
  },
  {
    href: '/twin/bootstrap',
    label: '分身冷启动',
    description: '通过固定问题集生成初版分身',
  },
]

export const SHARED_BACKEND_CONTRACTS = [
  '记忆确认后才进入正式结构化层',
  '分身始终只读取同一个 active version',
  '音色配置跨表面复用同一个 voice clone reference',
  '回忆录、分身、回顾都读取同一份正式记忆数据',
]
