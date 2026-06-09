import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";

type Props = {
  open: boolean;
  hasPassword: boolean;
  onVerified: () => void;
  onSetPassword: (password: string) => void;
  onSkip?: () => void;
};

export function PasswordGuard({ open, hasPassword, onVerified, onSetPassword, onSkip }: Props) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"verify" | "set">(hasPassword ? "verify" : "set");

  // Update mode when hasPassword changes
  useEffect(() => {
    setMode(hasPassword ? "verify" : "set");
  }, [hasPassword]);

  // 打开时清空输入
  useEffect(() => {
    if (open) {
      setPassword("");
      setConfirmPassword("");
      setError("");
    }
  }, [open]);

  const handleVerify = async () => {
    if (!password) {
      setError("请输入密码");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const ok = await invoke<boolean>("screenshot_verify_password", { password });
      if (ok) {
        onVerified();
      } else {
        setError("密码错误");
      }
    } catch (e) {
      setError("验证失败: " + String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async () => {
    if (!password) {
      setError("请输入密码");
      return;
    }
    if (password.length < 4) {
      setError("密码至少4个字符");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次密码输入不一致");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await invoke("screenshot_set_password", { password });
      onSetPassword(password);
    } catch (e) {
      setError("设置失败: " + String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (mode === "verify") {
        handleVerify();
      } else {
        handleSetPassword();
      }
    }
  };

  if (!open) return null;

  return (
    // 用 absolute 定位，相对于父容器（ReviewPage 的最外层）覆盖右侧内容区
    // 不使用全屏 Dialog，这样侧边栏和标题栏可正常交互
    <div className="absolute inset-0 z-30 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-20 p-6">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-lg">
        <div className="flex flex-col items-center gap-2 pt-6 pb-4 px-6">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-center">
            {mode === "verify" ? "输入截图密码" : "设置截图密码"}
          </h2>
          <p className="text-sm text-muted-foreground text-center">
            {mode === "verify"
              ? "截图已经加密，请输入密码查看"
              : "首次使用，请设置一个密码来保护您的截图"}
          </p>
        </div>

        <div className="space-y-3 px-6 pb-6">
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="输入密码"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {mode === "set" && (
            <div className="relative">
              <Input
                type={showConfirm ? "text" : "password"}
                placeholder="再次输入密码确认"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                onKeyDown={handleKeyDown}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowConfirm(!showConfirm)}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            className="w-full"
            onClick={mode === "verify" ? handleVerify : handleSetPassword}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "verify" ? (
              <ShieldCheck className="h-4 w-4 mr-2" />
            ) : (
              <Lock className="h-4 w-4 mr-2" />
            )}
            {mode === "verify" ? "解锁查看" : "设置密码"}
          </Button>

          {mode === "set" && onSkip && (
            <Button
              variant="ghost"
              className="w-full mt-2"
              onClick={onSkip}
            >
              暂时跳过
            </Button>
          )}

          {mode === "verify" && (
            <p className="text-xs text-center text-muted-foreground pt-2">
              忘记密码？去{" "}
              <span
                className="text-primary cursor-pointer underline"
                onClick={() => {
                  // 给用户提示：去设置页面清除所有截图和密码
                  alert("请在「设置」页面点击「清除所有截图」来重置密码");
                }}
              >
                设置页面
              </span>{" "}
              清除所有截图以重置
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
