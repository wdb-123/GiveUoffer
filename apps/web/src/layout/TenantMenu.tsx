interface TenantMenuProps {
  accountEmail: string;
  onLogout(): void;
  onOpenAdmin(): void;
  onOpenProfile(): void;
}

export function TenantMenu(props: TenantMenuProps) {
  return (
    <div className="tenant-menu" role="menu">
      <div className="tenant-menu-group" role="presentation">
        <button type="button" className="tenant-action-row" role="menuitem">
          <span className="tenant-row-icon" aria-hidden="true">◎</span>
          <span className="tenant-row-main"><strong>{props.accountEmail}</strong></span>
        </button>
        <button type="button" className="tenant-action-row" role="menuitem">
          <span className="tenant-row-icon" aria-hidden="true">☉</span>
          <span className="tenant-row-main"><strong>个人账户</strong></span>
        </button>
        <button type="button" className="tenant-action-row" role="menuitem" onClick={props.onOpenProfile}>
          <span className="tenant-row-icon" aria-hidden="true">◉</span>
          <span className="tenant-row-main"><strong>个人资料</strong></span>
        </button>
        <button type="button" className="tenant-action-row" role="menuitem" onClick={props.onOpenAdmin}>
          <span className="tenant-row-icon" aria-hidden="true">⚙</span>
          <span className="tenant-row-main"><strong>设置</strong></span>
        </button>
        <button type="button" className="tenant-action-row" role="menuitem" onClick={props.onOpenAdmin}>
          <span className="tenant-row-icon" aria-hidden="true">⌁</span>
          <span className="tenant-row-main"><strong>邀请成员</strong></span>
        </button>
      </div>
      <div className="tenant-menu-divider" />
      <div className="tenant-menu-group" role="presentation">
        <button type="button" className="tenant-action-row" role="menuitem" onClick={props.onOpenAdmin}>
          <span className="tenant-row-icon" aria-hidden="true">▣</span>
          <span className="tenant-row-main"><strong>管理员设置</strong></span>
          <span className="tenant-row-chevron" aria-hidden="true">›</span>
        </button>
        <button type="button" className="tenant-action-row" role="menuitem" onClick={props.onOpenAdmin}>
          <span className="tenant-row-icon" aria-hidden="true">◌</span>
          <span className="tenant-row-main"><strong>剩余用量</strong></span>
          <span className="tenant-row-chevron" aria-hidden="true">›</span>
        </button>
        <button type="button" className="tenant-action-row tenant-logout-row" role="menuitem" onClick={props.onLogout}>
          <span className="tenant-row-icon" aria-hidden="true">↪</span>
          <span>退出登录</span>
        </button>
      </div>
    </div>
  );
}
