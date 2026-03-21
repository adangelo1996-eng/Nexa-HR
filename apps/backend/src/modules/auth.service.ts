import { Injectable, UnauthorizedException } from "@nestjs/common";
import { sign } from "jsonwebtoken";
import type { AuthRole } from "./auth";
import { HrDataStore } from "./hr-data.store";

interface LoginUser {
  id: string;
  email: string;
  fullName: string;
  role: AuthRole;
}

@Injectable()
export class AuthService {
  constructor(private readonly store: HrDataStore) {}

  async login(email: string, password: string): Promise<{ token: string; user: LoginUser }> {
    const users = (await this.store.listUsers()) as LoginUser[];
    const user = users.find((item) => item.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      throw new UnauthorizedException("Credenziali non valide");
    }

    const expectedPassword = this.getPasswordForRole(user.role);
    if (password !== expectedPassword) {
      throw new UnauthorizedException("Credenziali non valide");
    }

    const secret = process.env.AUTH_JWT_SECRET ?? "dev-payday-secret-change-me";

    const token = sign({ role: user.role }, secret, { subject: user.id, expiresIn: "12h" });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    };
  }

  private getPasswordForRole(role: AuthRole): string {
    if (role === "admin") {
      return process.env.AUTH_ADMIN_PASSWORD ?? "AdminPayday123!";
    }
    if (role === "manager_controllo_gestione") {
      return process.env.AUTH_MANAGER_PASSWORD ?? "ManagerPayday123!";
    }
    return process.env.AUTH_EMPLOYEE_PASSWORD ?? "EmployeePayday123!";
  }
}
