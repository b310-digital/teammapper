import { Component } from '@angular/core';
import { Router } from '@angular/router';
import {
  MatDialogRef,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
  MatDialogClose,
} from '@angular/material/dialog';
import { ImportService } from 'src/app/core/services/import/import.service';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { MatFormField } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { TranslatePipe } from '@ngx-translate/core';
import { API_URL, HttpService } from 'src/app/core/http/http.service';

@Component({
  selector: 'teammapper-dialog-import-mermaid',
  templateUrl: 'dialog-import-mermaid.component.html',
  styleUrls: ['./dialog-import-mermaid.component.scss'],
  imports: [
    MatDialogTitle,
    CdkScrollable,
    MatDialogContent,
    MatFormField,
    MatInput,
    CdkTextareaAutosize,
    FormsModule,
    MatDialogActions,
    MatButton,
    MatDialogClose,
    TranslatePipe,
  ],
})
export class DialogImportMermaidComponent {
  public mermaidInput = '';
  constructor(
    private importService: ImportService,
    private httpService: HttpService,
    private dialogRef: MatDialogRef<DialogImportMermaidComponent>,
    private router: Router
  ) {}

  async createMermaidMindmapFromServer(): Promise<void> {
    const response = await this.httpService.post(
      API_URL.ROOT,
      '/mermaid/create',
      JSON.stringify({ topic: 'How to construct a house', language: 'english' })
    );
    this.mermaidInput = await response.text();
  }

  async import() {
    const success = await this.importService.importFromMermaid(
      this.mermaidInput
    );
    if (success) {
      this.dialogRef.close();
    }
  }
}
