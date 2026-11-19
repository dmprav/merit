ALTER TABLE "workspace_files" ADD CONSTRAINT "workspace_files_owner_key" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER POLICY "workspace_file_read" ON "workspace_files" TO public USING ((SELECT merit_scope()->>'kind') IN ('workspace', 'assignment')
  AND organization_id IN (SELECT merit_workspace_ids()));--> statement-breakpoint
ALTER POLICY "workspace_file_insert" ON "workspace_files" TO public WITH CHECK ((SELECT merit_scope()->>'kind') IN ('workspace', 'assignment')
  AND organization_id IN (SELECT merit_workspace_ids())
    AND uploaded_by = (SELECT merit_scope()->>'userId'));
