package com.chatapp.dto;

/** Call signaling payload — routes WebRTC offer/answer/ICE via STOMP */
public class CallSignal {
    private String to; // Target userId
    private String type; // offer | answer | ice-candidate | call-end | call-reject
    private Object data; // SDP object or ICE candidate object
    private String callType; // voice | video

    public String getTo() {
        return to;
    }

    public void setTo(String to) {
        this.to = to;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public Object getData() {
        return data;
    }

    public void setData(Object data) {
        this.data = data;
    }

    public String getCallType() {
        return callType;
    }

    public void setCallType(String callType) {
        this.callType = callType;
    }
}
