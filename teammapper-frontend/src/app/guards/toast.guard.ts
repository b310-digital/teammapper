import { Injectable } from '@angular/core';
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
  constructor(private router: Router, private toastrService: ToastrService) {}

  canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    const toastMessage = next.queryParamMap.get('toastMessage');

    if (toastMessage) {
      this.toastrService.success(toastMessage);

      // This preserves both map UUID and the all important fragment whilst deleting anything toast-related.
      const urlTree = this.router.parseUrl(state.url);
      delete urlTree.queryParams['toastMessage'];
      this.router.navigateByUrl(urlTree);

      return true;
    }
    return true;
  }
}
