import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialogRef } from '@angular/material/dialog';
import { ImportService } from 'src/app/core/services/import/import.service';

@Component({
  selector: 'teammapper-dialog-import-mermaid',
  templateUrl: 'dialog-import-mermaid.component.html',
  styleUrls: ['./dialog-import-mermaid.component.scss'],
  standalone: false,
})
export class DialogImportMermaidComponent {
  public mermaidInput = '';
  constructor(
    private importService: ImportService,
    private dialogRef: MatDialogRef<DialogImportMermaidComponent>,
    private router: Router
  ) {}

  async import() {
    const success = await this.importService.importFromMermaid(
      this.mermaidInput
    );
    if (success) {
      this.dialogRef.close();
    }
  }
}
