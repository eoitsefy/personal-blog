export function identityLinks(role: "USER" | "ADMIN" | undefined) {
  if (role === "ADMIN") return [{ href: "/account", label: "账户" }, { href: "/admin", label: "管理台" }];
  if (role === "USER") return [{ href: "/account", label: "账户" }];
  return [{ href: "/login", label: "登录" }, { href: "/register", label: "注册" }];
}
