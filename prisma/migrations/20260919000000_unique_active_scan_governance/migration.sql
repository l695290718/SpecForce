DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "SystemScanGovernanceRecord"
    WHERE "status" = 'ACTIVE'
    GROUP BY "kind"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'SYSTEM_SCAN_GOVERNANCE_ACTIVE_DUPLICATE: resolve duplicate ACTIVE versions before migration';
  END IF;
END $$;

CREATE UNIQUE INDEX "SystemScanGovernanceRecord_active_kind_key"
ON "SystemScanGovernanceRecord" ("kind")
WHERE "status" = 'ACTIVE';
