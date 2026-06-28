package com.englishwebapp.dto;

import com.englishwebapp.entity.VocabSet;
import java.util.List;

public record VocabSetSession(VocabSet set, List<VocabWordCard> words) {
}
