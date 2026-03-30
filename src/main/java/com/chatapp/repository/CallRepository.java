package com.chatapp.repository;

import com.chatapp.model.Call;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface CallRepository extends MongoRepository<Call, String> {
    List<Call> findByCallerOrReceiverOrderByStartTimeDesc(String caller, String receiver);
}
