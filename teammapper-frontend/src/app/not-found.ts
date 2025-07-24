import { Component } from '@angular/core';

@Component({
  selector: 'teammapper-not-found',
  template: `
    <div class="not-found-container">
      <h1>404 Not Found</h1>
    </div>
  `,
  styles: [
    `
      .not-found-container {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        font-family:
          Fira Sans,
          sans-serif;
      }

      h1 {
        font-size: 2rem;
        color: #333;
        margin: 0;
      }
    `,
  ],
})
export class NotFoundComponent {}
