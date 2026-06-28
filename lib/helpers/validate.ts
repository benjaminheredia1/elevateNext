import apiClient from "@/hooks/api";

export default async function ValidateToken(token: string) {
    const response = apiClient.post("validate", {
        token: token
    })
    return response
}