import { CognitoUserPool, CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js'

const userPool = new CognitoUserPool({
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  ClientId:   import.meta.env.VITE_COGNITO_CLIENT_ID,
})

export async function login(email, password) {
  return new Promise((resolve, reject) => {
    const user    = new CognitoUser({ Username: email, Pool: userPool })
    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    })

    user.authenticateUser(authDetails, {
      onSuccess: (session) => {
        const token = session.getIdToken().getJwtToken()
        localStorage.setItem('sri_token', token)
        localStorage.setItem('sri_email', email)
        resolve(token)
      },
      onFailure: (err) => reject(err),

      // Primera vez que el usuario entra debe cambiar contraseña
      newPasswordRequired: (userAttributes) => {
        resolve({ newPasswordRequired: true, user, userAttributes })
      }
    })
  })
}

export async function cambiarPasswordInicial(user, newPassword) {
  return new Promise((resolve, reject) => {
    user.completeNewPasswordChallenge(newPassword, {}, {
      onSuccess: (session) => {
        const token = session.getIdToken().getJwtToken()
        localStorage.setItem('sri_token', token)
        resolve(token)
      },
      onFailure: reject
    })
  })
}

export function logout() {
  const user = userPool.getCurrentUser()
  if (user) user.signOut()
  localStorage.removeItem('sri_token')
  localStorage.removeItem('sri_email')
}

export function getToken() {
  return localStorage.getItem('sri_token')
}

export function getEmail() {
  return localStorage.getItem('sri_email')
}

export function isAuthenticated() {
  return !!getToken()
}