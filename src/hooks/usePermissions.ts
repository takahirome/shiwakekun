import { useState, useEffect } from "react";
import {
  checkAccessibilityPermission,
  requestAccessibilityPermission,
  checkFullDiskAccessPermission,
  requestFullDiskAccessPermission,
} from "tauri-plugin-macos-permissions-api";
import { PermissionStatus } from "../types";

/**
 * macOSのパーミッション管理に関するカスタムフック
 */
export function usePermissions() {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>({
    accessibility: "未確認",
    fullDiskAccess: "未確認",
  });

  // 初期化時にパーミッションを確認
  useEffect(() => {
    checkPermissions();
  }, []);

  /**
   * 現在のパーミッション状態を確認して更新
   */
  async function checkPermissions() {
    try {
      const accessibility = await checkAccessibilityPermission();
      const fullDiskAccess = await checkFullDiskAccessPermission();

      setPermissionStatus({
        accessibility: accessibility ? "許可" : "未許可",
        fullDiskAccess: fullDiskAccess ? "許可" : "未許可",
      });
    } catch (error) {
      console.error("パーミッション確認エラー:", error);
    }
  }

  /**
   * 特定のパーミッションをリクエスト
   * @param type パーミッションの種類
   */
  async function requestPermission(type: "accessibility" | "fullDiskAccess") {
    try {
      switch (type) {
        case "accessibility":
          await requestAccessibilityPermission();
          break;
        case "fullDiskAccess":
          await requestFullDiskAccessPermission();
          break;
      }

      // 要求後に状態を更新
      await checkPermissions();
    } catch (error) {
      console.error(`${type}パーミッション要求エラー:`, error);
    }
  }

  return {
    permissionStatus,
    checkPermissions,
    requestPermission,
  };
} 