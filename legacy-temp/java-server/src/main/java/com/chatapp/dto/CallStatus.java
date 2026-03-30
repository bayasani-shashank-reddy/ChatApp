package com.chatapp.dto;

public class CallStatus {
    private String callId;
    private String status; // e.g., "IN_PROGRESS", "COMPLETED", "FAILED"

    public String getCallId() {
        return callId;
    }

    public void setCallId(String callId) {
        this.callId = callId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }
}
