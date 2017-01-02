package com.getmicropad.NPXParser;

import org.simpleframework.xml.Serializer;
import org.simpleframework.xml.core.Persister;
import org.simpleframework.xml.stream.Format;

import java.io.ByteArrayOutputStream;

public class Main {

    public static void main(String[] args) {
        Serializer serializer = new Persister(new NPXMatcher(), new Format("<?xml version=\"1.0\" encoding= \"UTF-8\" ?>"));
        Notepad notepad = new Notepad("Test");

        Section s1 = new Section("test section");
        Note n1 = new Note("Blarghh");
        Note n2 = new Note("More");
        s1.notes.add(n1);
	    s1.notes.add(n2);
        notepad.sections.add(s1);
	    notepad.sections.add(new Section("More"));

	    ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
	    try {
		    serializer.write(notepad, byteArrayOutputStream);
		    System.out.println(byteArrayOutputStream.toString());
	    } catch (Exception e) {
		    e.printStackTrace();
	    }
    }
}
