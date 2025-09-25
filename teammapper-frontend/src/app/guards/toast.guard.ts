import { Injectable, inject } from '@angular/core';
import {
  CanActivate,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Router,
} from '@angular/router';
import { ToastrService } from 'ngx-toastr';

@Injectable({
  providedIn: 'root',
})
export class ToastGuard implements CanActivate {
  private router = inject(Router);
  private toastrService = inject(ToastrService);

  canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    const toastMessage = next.queryParamMap.get('toastMessage');
    const toastError = next.queryParamMap.get('toastIsError');

    if (toastMessage) {
      if (!toastError) {
        this.toastrService.success(toastMessage);
      } else {
        this.toastrService.error(toastMessage);
      }

      // This preserves both map UUID and the all important fragment whilst deleting anything toast-related.
      const urlTree = this.router.parseUrl(state.url);
      delete urlTree.queryParams['toastMessage'];
      this.router.navigateByUrl(urlTree, { replaceUrl: true });

      return true;
    }
    return true;
  }
}
