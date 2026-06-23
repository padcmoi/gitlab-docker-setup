declare module "#auth-utils" {
  interface User {
    id: number;
    username: string;
    name: string;
    email: string;
  }
  interface UserSession {
    user?: User;
    oauthState?: string;
  }
}

export {};
